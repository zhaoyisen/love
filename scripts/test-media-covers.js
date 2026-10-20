const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function load(relativePath, dependencies = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, { exports, console, Date, require(name) {
    assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
    return dependencies[name];
  }, ...globals }, { filename });
  return exports;
}

function fixture({ deferred = false, imageSize = 1024 } = {}) {
  const files = new Map();
  const storage = new Map();
  const requests = [];
  const directories = new Set();
  const fileSystem = {
    mkdirSync(directory) { if (directories.has(directory)) throw new Error("already exists"); directories.add(directory); },
    accessSync(file) { if (!files.has(file) && !directories.has(file)) throw new Error("missing"); },
    statSync(file) { if (!files.has(file)) throw new Error("missing"); return { size: files.get(file) }; },
    copyFileSync(source, destination) { files.set(destination, files.get(source)); },
    unlinkSync(file) { files.delete(file); },
    readdirSync(directory) { return [...files.keys()].filter((file) => file.startsWith(directory + "/")).map((file) => file.slice(directory.length + 1)); }
  };
  const wx = {
    env: { USER_DATA_PATH: "wxfile://user" },
    getFileSystemManager: () => fileSystem,
    getStorageSync: (key) => storage.get(key),
    setStorageSync(key, value) { storage.set(key, JSON.parse(JSON.stringify(value))); },
    removeStorageSync(key) { storage.delete(key); },
    getImageInfo(options) {
      const index = requests.length;
      requests.push(options);
      const temporary = `wxfile://temp/${index}.jpg`;
      files.set(temporary, imageSize);
      if (!deferred) options.success({ path: temporary, type: "jpeg" });
    }
  };
  const reload = () => load("miniprogram/core/media-cache.ts", {}, { wx }).mediaCache;
  return { cache: reload(), reload, files, storage, wx, requests };
}

const firstUrl = "https://bucket.cos.test/thumbnail/video.jpg?q-signature=first";
const rotatedUrl = "https://bucket.cos.test/thumbnail/video.jpg?q-signature=second";

test("cover persists across app restarts and reuses the file when COS signatures rotate", async () => {
  const f = fixture();
  const saved = await f.cache.remember("me", "video", firstUrl);
  assert.match(saved, /^wxfile:\/\/user\/media-cover-cache\//);
  assert.equal(f.reload().get("me", "video", rotatedUrl), saved);
  assert.equal(f.requests.length, 1);
  assert.equal(f.cache.get("other-user", "video", rotatedUrl), undefined);
  assert.equal(f.cache.get("me", "video", "https://bucket.cos.test/thumbnail/different.jpg"), undefined);
});

test("files removed by the OS are detected and can be downloaded again", async () => {
  const f = fixture();
  const saved = await f.cache.remember("me", "video", firstUrl);
  f.files.delete(saved);
  assert.equal(f.cache.get("me", "video", rotatedUrl), undefined);
  const replacement = await f.cache.remember("me", "video", rotatedUrl);
  assert.ok(f.files.has(replacement));
  assert.equal(f.requests.length, 2);
});

test("clearing the session prevents in-flight covers from being saved afterwards", async () => {
  const f = fixture({ deferred: true });
  const promise = f.cache.remember("me", "video", firstUrl);
  assert.equal(f.cache.remember("me", "video", rotatedUrl), promise);
  f.cache.clear();
  f.requests[0].success({ path: "wxfile://temp/0.jpg", type: "jpeg" });
  assert.equal(await promise, firstUrl);
  assert.equal([...f.files.keys()].filter((file) => file.includes("media-cover-cache")).length, 0);
  assert.equal(f.reload().get("me", "video", firstUrl), undefined);
});

test("server-authorized timeline removes revoked covers and prevents pending stale saves", async () => {
  const f = fixture();
  await f.cache.remember("me", "allowed", firstUrl);
  await f.cache.remember("me", "revoked", firstUrl);
  f.cache.retain("me", ["allowed"]);
  assert.ok(f.cache.get("me", "allowed", firstUrl));
  assert.equal(f.cache.get("me", "revoked", firstUrl), undefined);
  assert.equal(f.reload().get("me", "revoked", firstUrl), undefined);
});

test("cover cache stays within byte and file limits and never saves oversized originals", async () => {
  const f = fixture({ imageSize: 512 * 1024 });
  for (let i = 0; i < 120; i++) await f.cache.remember("me", `asset-${i}`, firstUrl);
  const savedFiles = [...f.files].filter(([file]) => file.includes("media-cover-cache"));
  assert.ok(savedFiles.length <= 100);
  assert.ok(savedFiles.reduce((bytes, [, size]) => bytes + size, 0) <= 32 * 1024 * 1024);
  const large = fixture({ imageSize: 21 * 1024 * 1024 });
  assert.equal(await large.cache.remember("me", "large", firstUrl), firstUrl);
  assert.equal(large.cache.get("me", "large", firstUrl), undefined);
});

test("image-info failures keep the original URL and downloads are limited to three at a time", async () => {
  const f = fixture({ deferred: true });
  const jobs = Array.from({ length: 6 }, (_, i) => f.cache.remember("me", `asset-${i}`, firstUrl));
  assert.equal(f.requests.length, 3);
  for (let i = 0; i < 6; i++) f.requests[i].fail({ errMsg: "offline" });
  assert.ok((await Promise.all(jobs)).every((result) => result === firstUrl));
  assert.equal(f.cache.get("me", "asset-0", firstUrl), undefined);
});

test("video card uses the cached cover immediately and falls back if its local image cannot render", async () => {
  const f = fixture();
  const saved = await f.cache.remember("me", "video", firstUrl);
  let loggedIn = true;
  let definition;
  load("miniprogram/components/moment-card/index.ts", {
    "../../core/media-cache": { mediaCache: f.cache },
    "../../services/request": { hasSession: () => loggedIn },
    "../../core/store": { store: { getState: () => ({ loggedIn: true, profile: { id: "me" } }) } },
    "../../core/format": load("miniprogram/core/format.ts")
  }, { Component(value) { definition = value; }, wx: f.wx });
  const card = { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  const item = { id: "moment", mediaType: "VIDEO", occurredAt: new Date().toISOString(),
    comments: [], events: [], media: [{ assetId: "video", status: "READY", thumbnailPath: rotatedUrl }] };
  definition.observers.item.call(card, item);
  assert.equal(card.data.coverPath, saved);
  definition.methods.coverLoaded.call(card);
  assert.equal(f.requests.length, 1);
  definition.methods.imageError.call(card, { detail: {} });
  assert.equal(card.data.coverPath, rotatedUrl);
  assert.equal(f.cache.get("me", "video", rotatedUrl), undefined);
  loggedIn = false;
  definition.methods.coverLoaded.call(card);
  assert.equal(f.requests.length, 1, "late image load after logout must not repopulate the cache");
});

test("home shows cached moments before synchronization and does not fetch the latest timeline twice", async () => {
  let resolveRefresh;
  let refreshPromise;
  let extraTimelineCalls = 0;
  let definition;
  const moment = { id: "cached-moment", occurredAt: new Date().toISOString(), status: "PUBLISHED", author: "我", media: [] };
  const state = { loggedIn: true, profile: { id: "me" }, couple: { status: "UNPAIRED", partnerName: "TA" }, moments: [moment], messages: [] };
  const appService = {
    isRemote: true, hasSession: () => true,
    refresh: () => new Promise((resolve) => { resolveRefresh = resolve; }),
    timelinePage() { extraTimelineCalls++; throw new Error("should reuse initial sync"); }
  };
  load("miniprogram/pages-main/time/index.ts", {
    "../../core/store": { store: { getState: () => state } },
    "../../services/app-service": { appService, redirectExpiredSession: () => false, userError: (error) => error.message }
  }, { Page(value) { definition = value; }, wx: { stopPullDownRefresh() {} }, setTimeout: () => 1, clearTimeout() {} });
  const page = { ...definition, data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  const refresh = page.refresh;
  page.refresh = function () { refreshPromise = refresh.call(this); return refreshPromise; };
  page.onShow();
  assert.equal(page.data.moments[0].id, "cached-moment");
  assert.equal(page.data.loaded, true);
  assert.equal(page.data.loading, true);
  resolveRefresh({ from: "2000-01-01", to: "2030-01-01", nextCursor: "next", hasMore: true });
  await refreshPromise;
  assert.equal(extraTimelineCalls, 0);
  assert.equal(page.data.nextCursor, "next");
  assert.equal(page.data.hasMore, true);
});

test("changing account, unbinding and resetting clear sensitive cover caches", () => {
  let clears = 0;
  const { store } = load("miniprogram/core/store.ts", {
    "./api-config": { API_CONFIG: { useRemoteApi: true } },
    "./media-cache": { mediaCache: { clear() { clears++; }, retain() {} } }
  }, { wx: { setStorageSync() {} } });
  store.applyRemoteProfile({ id: "first", name: "first" });
  store.applyRemoteCouple({ id: "space", status: "PAIRED" });
  store.applyRemoteCouple(null);
  assert.equal(clears, 1);
  store.applyRemoteProfile({ id: "second", name: "second" });
  assert.equal(clears, 2);
  store.reset();
  assert.equal(clears, 3);
});

test("missing covers refresh automatically, stop once ready, and never poll a hidden page indefinitely", async () => {
  const timers = new Map();
  let nextTimer = 0;
  let calls = 0;
  let definition;
  const pendingMoment = { id: "video", occurredAt: new Date().toISOString(), status: "PUBLISHED", author: "我", mediaType: "VIDEO",
    media: [{ assetId: "video", status: "READY" }] };
  const readyMoment = { ...pendingMoment, media: [{ assetId: "video", status: "READY", thumbnailPath: firstUrl }] };
  const state = { profile: { id: "me" }, couple: { status: "UNPAIRED", partnerName: "TA" }, moments: [pendingMoment], messages: [] };
  load("miniprogram/pages-main/time/index.ts", {
    "../../core/store": { store: { getState: () => state, appendRemoteMoments() {} } },
    "../../services/app-service": { appService: { isRemote: true, hasSession: () => true,
      async detail() { calls++; return readyMoment; }
    }, redirectExpiredSession: () => false, userError: (error) => error.message }
  }, { Page(value) { definition = value; },
    setTimeout(callback, ms) { assert.equal(ms, 5000); const id = ++nextTimer; timers.set(id, callback); return id; },
    clearTimeout(id) { timers.delete(id); } });
  const page = { ...definition, visible: true, remoteMoments: [pendingMoment], data: { ...definition.data, moments: [pendingMoment] },
    setData(patch) { for (const [key, value] of Object.entries(patch)) { const match = key.match(/^moments\[(\d+)\]$/); if (match) this.data.moments[Number(match[1])] = value; else this.data[key] = value; } } };
  page.scheduleMediaRefresh();
  assert.equal(timers.size, 1);
  const [timerId, callback] = [...timers][0]; timers.delete(timerId);
  await callback();
  assert.equal(calls, 1);
  assert.equal(page.data.moments[0].media[0].thumbnailPath, firstUrl);
  assert.equal(timers.size, 0);
  page.remoteMoments = [pendingMoment];
  page.mediaPollCount = 12;
  page.scheduleMediaRefresh();
  assert.equal(timers.size, 0);
  page.mediaPollCount = 0;
  page.scheduleMediaRefresh();
  page.onHide();
  assert.equal(timers.size, 0);
  page.scheduleMediaRefresh();
  assert.equal(timers.size, 0);
});

test("malformed cache metadata cannot remove files outside the generated cover directory", () => {
  const f = fixture();
  const unrelated = "wxfile://user/private-draft.jpg";
  f.files.set(unrelated, 10);
  f.storage.set("love-notes:cover-cache:v1", { bad: {
    owner: "me", assetId: "bad", path: "wxfile://user/media-cover-cache/../private-draft.jpg", size: 10, usedAt: Date.now()
  } });
  f.reload().clear();
  assert.ok(f.files.has(unrelated));
});

test("partner covers require an unexpired authorized URL even when their files are cached", async () => {
  const f = fixture();
  const future = Math.floor(Date.now() / 1000) + 900;
  const authorized = `${firstUrl}&q-key-time=0%3B${future}`;
  const saved = await f.cache.remember("me", "partner-video", authorized, true);
  assert.equal(f.cache.get("me", "partner-video", authorized, true), saved);
  const expired = `${firstUrl}&q-key-time=0%3B1`;
  assert.equal(f.cache.get("me", "partner-video", expired, true), undefined);
  assert.equal(await f.cache.remember("me", "partner-video", expired, true), expired);
  assert.equal(f.requests.length, 1);
  assert.equal(f.cache.get("me", "partner-video", expired), saved, "own covers can still reuse the stored object");
});

test("refreshing the same authorized assets does not cancel a cover being saved", async () => {
  const f = fixture({ deferred: true });
  const pending = f.cache.remember("me", "video", firstUrl);
  f.cache.retain("me", ["video"]);
  f.requests[0].success({ path: "wxfile://temp/0.jpg", type: "jpeg" });
  const saved = await pending;
  assert.match(saved, /^wxfile:\/\/user\/media-cover-cache\//);
  assert.equal(f.cache.get("me", "video", rotatedUrl), saved);
});

test("a loaded card saves a local copy without replacing the visible image", async () => {
  const f = fixture(); let definition;
  load("miniprogram/components/moment-card/index.ts", {
    "../../core/media-cache": { mediaCache: f.cache },
    "../../services/request": { hasSession: () => true },
    "../../core/store": { store: { getState: () => ({ loggedIn: true, profile: { id: "me" } }) } },
    "../../core/format": load("miniprogram/core/format.ts")
  }, { Component(value) { definition = value; }, wx: f.wx });
  const card = { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  definition.observers.item.call(card, { id: "moment", author: "我", mediaType: "IMAGE", occurredAt: new Date().toISOString(), media: [{ assetId: "photo", status: "READY", thumbnailPath: firstUrl }] });
  await definition.methods.coverLoaded.call(card);
  await Promise.resolve();
  assert.equal(card.data.coverPath, firstUrl);
  assert.match(f.cache.get("me", "photo", firstUrl), /^wxfile:\/\/user\/media-cover-cache\//);
  definition.observers.item.call(card, { id: "responded", author: "TA", mediaType: "TEXT", occurredAt: new Date().toISOString(), media: [], reaction: { actor: "我", value: "心动" } });
  assert.equal(card.data.responseIsMe, true, "a response uses its actual author's avatar");
});

test("an incomplete first timeline page does not delete covers belonging to later pages", async () => {
  const f = fixture();
  const saved = await f.cache.remember("me", "older-photo", firstUrl);
  const { store } = load("miniprogram/core/store.ts", { "./api-config": { API_CONFIG: { useRemoteApi: true } }, "./media-cache": { mediaCache: f.cache } }, { wx: f.wx });
  store.applyRemoteProfile({ id: "me", name: "我" });
  store.replaceRemoteMoments([], false);
  assert.equal(f.cache.get("me", "older-photo", firstUrl), saved);
  store.replaceRemoteMoments([], true);
  assert.equal(f.cache.get("me", "older-photo", firstUrl), undefined);
});

test("an ordinary full-size photo over 2MB survives reopening without another download", async () => {
  const f = fixture({ imageSize: 3 * 1024 * 1024 });
  const saved = await f.cache.remember("me", "photo", firstUrl);
  assert.match(saved, /^wxfile:\/\/user\/media-cover-cache\//);
  const reopened = f.reload();
  assert.equal(await reopened.remember("me", "photo", rotatedUrl), saved);
  assert.equal(f.requests.length, 1);
});

test("a signature-only metadata refresh keeps the displayed cover while its cache is unavailable", () => {
  let definition, owner = "me";
  load("miniprogram/components/moment-card/index.ts", {
    "../../core/media-cache": { mediaCache: { get() {} } },
    "../../services/request": { hasSession: () => true },
    "../../core/store": { store: { getState: () => ({ loggedIn: true, profile: { id: owner } }) } },
    "../../core/format": load("miniprogram/core/format.ts")
  }, { Component(value) { definition = value; } });
  const card = { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  const moment = { id: "photo", author: "我", mediaType: "IMAGE", occurredAt: new Date().toISOString(), media: [{ assetId: "photo", status: "READY", path: firstUrl }] };
  definition.observers.item.call(card, moment);
  definition.observers.item.call(card, { ...moment, body: "更新正文", media: [{ ...moment.media[0], path: rotatedUrl }] });
  assert.equal(card.data.coverPath, firstUrl);
  assert.equal(card.data.coverSource, rotatedUrl);
  const replacement = "https://bucket.cos.test/thumbnail/changed.jpg";
  definition.observers.item.call(card, { ...moment, media: [{ ...moment.media[0], path: replacement }] });
  assert.equal(card.data.coverPath, replacement);
  owner = "other";
  definition.observers.item.call(card, { ...moment, media: [{ ...moment.media[0], path: replacement + "?new-owner" }] });
  assert.equal(card.data.coverPath, replacement + "?new-owner");
});

test("published images with a usable original do not schedule a five-second missing-cover refresh", () => {
  let page;
  const timers = [];
  load("miniprogram/pages-main/time/index.ts", {
    "../../core/store": { store: {} },
    "../../services/app-service": { appService: { isRemote: true, hasSession: () => true } }
  }, { Page(value) { page = value; }, setTimeout(callback) { timers.push(callback); return timers.length; }, clearTimeout() {} });
  page.visible = true;
  page.remoteMoments = [{ status: "PUBLISHED", mediaType: "IMAGE", media: [{ status: "READY", path: firstUrl }] }];
  page.scheduleMediaRefresh(); assert.equal(timers.length, 0);
  page.remoteMoments = [{ status: "PUBLISHED", mediaType: "IMAGE", media: [{ status: "FAILED" }] }, { status: "PUBLISHED", mediaType: "VIDEO", media: [{ status: "FAILED" }] }];
  page.scheduleMediaRefresh(); assert.equal(timers.length, 0, "lost media must not participate in preparation polling");
  page.remoteMoments = [{ status: "UPLOADING", mediaType: "IMAGE", media: [{ status: "PROCESSING" }] }];
  page.scheduleMediaRefresh(); assert.equal(timers.length, 1);
});

test("keeping a displayed partner cover never extends an expired signed URL", async () => {
  const f = fixture(); let definition;
  const valid = firstUrl + "&q-key-time=1;" + (Math.floor(Date.now() / 1000) + 3600);
  const expired = rotatedUrl + "&q-key-time=1;1";
  const saved = await f.cache.remember("me", "photo", valid, true);
  load("miniprogram/components/moment-card/index.ts", {
    "../../core/media-cache": { mediaCache: f.cache },
    "../../services/request": { hasSession: () => true },
    "../../core/store": { store: { getState: () => ({ loggedIn: true, profile: { id: "me" } }) } },
    "../../core/format": load("miniprogram/core/format.ts")
  }, { Component(value) { definition = value; } });
  const card = { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  const moment = { id: "photo", author: "TA", mediaType: "IMAGE", occurredAt: new Date().toISOString(), media: [{ assetId: "photo", status: "READY", path: valid }] };
  definition.observers.item.call(card, moment); assert.equal(card.data.coverPath, saved);
  definition.observers.item.call(card, { ...moment, media: [{ ...moment.media[0], path: expired }] });
  assert.equal(card.data.coverPath, expired);
});

test("a cover finishing after metadata rotates still saves a persistent file for reopening", async () => {
  const f = fixture(); let definition;
  load("miniprogram/components/moment-card/index.ts", {
    "../../core/media-cache": { mediaCache: f.cache },
    "../../services/request": { hasSession: () => true },
    "../../core/store": { store: { getState: () => ({ loggedIn: true, profile: { id: "me" } }) } },
    "../../core/format": load("miniprogram/core/format.ts")
  }, { Component(value) { definition = value; }, wx: f.wx });
  const card = { data: { ...definition.data }, setData(patch) { Object.assign(this.data, patch); } };
  const moment = { id: "photo", author: "我", mediaType: "IMAGE", occurredAt: new Date().toISOString(), media: [{ assetId: "photo", status: "READY", path: firstUrl }] };
  definition.observers.item.call(card, moment);
  definition.observers.item.call(card, { ...moment, media: [{ ...moment.media[0], path: rotatedUrl }] });
  await definition.methods.coverLoaded.call(card);
  assert.equal(f.requests.length, 1);
  assert.equal(card.data.coverPath, firstUrl);
  assert.match(f.cache.get("me", "photo", rotatedUrl), /^wxfile:\/\/user\/media-cover-cache\//);
});

test("saving and refreshing a visible cover never rebinds its image source", async () => {
  const f = fixture(); let definition; const patches = [];
  load("miniprogram/components/moment-card/index.ts", {
    "../../core/media-cache": { mediaCache: f.cache },
    "../../services/request": { hasSession: () => true },
    "../../core/store": { store: { getState: () => ({ loggedIn: true, profile: { id: "me" } }) } },
    "../../core/format": load("miniprogram/core/format.ts")
  }, { Component(value) { definition = value; }, wx: f.wx });
  const card = { data: { ...definition.data }, setData(patch) { patches.push(patch); Object.assign(this.data, patch); } };
  const moment = { id: "photo", author: "我", mediaType: "IMAGE", occurredAt: new Date().toISOString(), media: [{ assetId: "photo", status: "READY", path: firstUrl }] };
  definition.observers.item.call(card, moment); patches.length = 0;
  await definition.methods.coverLoaded.call(card);
  definition.observers.item.call(card, { ...moment, media: [{ ...moment.media[0], path: rotatedUrl }] });
  assert.equal(card.data.coverPath, firstUrl);
  assert.ok(f.cache.get("me", "photo", rotatedUrl), "the persistent copy remains available on the next entry");
  assert.equal(patches.filter(patch => Object.hasOwn(patch, "coverPath")).length, 0);
});

test("returning from detail or another tab does not resend an unchanged timeline list", async () => {
  let definition; const patches=[];
  const moment={id:"photo",author:"我",status:"PUBLISHED",mediaType:"IMAGE",occurredAt:new Date().toISOString(),media:[{id:"image",assetId:"image",status:"READY",path:firstUrl}],comments:[],events:[]};
  const state={loggedIn:true,profile:{id:"me"},couple:{id:"pair",status:"PAIRED"},moments:[moment],messages:[]};
  const service={isRemote:true,hasSession:()=>true,async refresh(){return {from:"2000-01-01",to:"2026-10-20",hasMore:false,nextCursor:""}}};
  load("miniprogram/pages-main/time/index.ts",{
    "../../core/store":{store:{getState:()=>state}},"../../services/app-service":{appService:service,redirectExpiredSession:()=>false,userError:error=>error.message}
  },{Page(value){definition=value},wx:{stopPullDownRefresh(){}},setTimeout:()=>1,clearTimeout(){}});
  const page={...definition,data:structuredClone(definition.data),setData(patch){patches.push(patch);for(const[key,value]of Object.entries(patch)){const match=key.match(/^moments\[(\d+)\]$/);if(match)this.data.moments[Number(match[1])]=value;else this.data[key]=value}}};
  await page.onShow();await new Promise(resolve=>setImmediate(resolve));patches.length=0;
  page.onHide();await page.onShow();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.data.moments[0].id,"photo");assert.equal(patches.filter(patch=>"moments"in patch).length,0);
  state.moments=[{...moment,body:"详情中更新的正文"}];patches.length=0;
  page.onHide();await page.onShow();await new Promise(resolve=>setImmediate(resolve));
  assert.equal(page.data.moments[0].body,"详情中更新的正文");assert.equal(patches.filter(patch=>"moments"in patch).length,0);
  page.remoteMoments[0].body="原位更新的正文";patches.length=0;page.render();
  assert.ok(patches.some(patch=>Object.hasOwn(patch,"moments[0]")),"in-place updates still reach the view");
});

test("background media polling updates only pending rows and preserves ready covers and pagination", async () => {
  const timers = new Map(), patches = [], calls = []; let definition;
  const image = { id: "photo", status: "PUBLISHED", author: "我", mediaType: "IMAGE", media: [{ status: "READY", path: firstUrl }] };
  const video = { id: "video", status: "PUBLISHED", author: "我", mediaType: "VIDEO", media: [{ status: "READY", path: "https://cos/video.mp4" }] };
  const ready = { ...video, media: [{ ...video.media[0], thumbnailPath: firstUrl }] };
  const state = { loggedIn: true, profile: { id: "me" }, couple: { id: "pair", status: "PAIRED" } };
  load("miniprogram/pages-main/time/index.ts", {
    "../../core/store": { store: { getState: () => state } },
    "../../services/app-service": { appService: { isRemote: true, hasSession: () => true, async detail(id) { calls.push(id); return ready; }, timelinePage() { throw new Error("must not reload ready rows"); } } }
  }, { Page(value) { definition = value; }, setTimeout(callback) { timers.set(1, callback); return 1; }, clearTimeout(id) { timers.delete(id); } });
  const page = { ...definition, visible: true, remoteMoments: [image, video], data: { ...definition.data, moments: [image, video], hasMore: true, nextCursor: "older" }, setData(patch) { patches.push(patch); for (const [key, value] of Object.entries(patch)) { const match = key.match(/^moments\[(\d+)\]$/); if (match) this.data.moments[Number(match[1])] = value; else this.data[key] = value; } } };
  page.scheduleMediaRefresh(); const callback = timers.get(1); timers.delete(1); await callback();
  assert.deepEqual(calls, ["video"]);
  assert.equal(page.remoteMoments[0], image); assert.equal(page.data.moments[0], image);
  assert.equal(page.data.moments[1].media[0].thumbnailPath, firstUrl);
  assert.ok(patches.some(patch => Object.hasOwn(patch, "moments[1]")));
  assert.ok(patches.every(patch => !Object.hasOwn(patch, "moments")));
  assert.equal(page.data.nextCursor, "older"); assert.equal(page.data.hasMore, true); assert.equal(timers.size, 0);
});

test("a late media poll cannot update a hidden page, another range, account or relationship", async () => {
  for (const changed of ["hide", "range", "account", "couple", "session"]) {
    let definition, finish, session = true; const timers = new Map(), patches = [];
    const item = { id: "video", author: "TA", status: "UPLOADING", mediaType: "VIDEO", media: [] };
    const state = { profile: { id: "me" }, couple: { id: "pair", status: "PAIRED" } };
    load("miniprogram/pages-main/time/index.ts", {
      "../../core/store": { store: { getState: () => state } },
      "../../services/app-service": { appService: { isRemote: true, hasSession: () => session, detail: () => new Promise(resolve => { finish = resolve; }) } }
    }, { Page(value) { definition = value; }, setTimeout(callback) { timers.set(1, callback); return 1; }, clearTimeout(id) { timers.delete(id); } });
    const page = { ...definition, visible: true, remoteMoments: [item], data: { ...definition.data, moments: [item] }, setData(patch) { patches.push(patch); Object.assign(this.data, patch); } };
    page.scheduleMediaRefresh(); const callback = timers.get(1); timers.delete(1); const polling = callback();
    if (changed === "hide") page.onHide();
    if (changed === "range") page.rangeRequestId++;
    if (changed === "account") state.profile.id = "another";
    if (changed === "couple") state.couple.id = "new-pair";
    if (changed === "session") session = false;
    finish({ ...item, status: "PUBLISHED", media: [{ status: "READY", thumbnailPath: firstUrl }] }); await polling;
    assert.equal(page.remoteMoments[0], item, changed); assert.equal(patches.length, 0, changed); assert.equal(timers.size, 0, changed);
  }
});

test("poll errors keep content on a network failure and refresh authorization after a denied record", async () => {
  for (const code of ["NETWORK_ERROR", "RESOURCE_FORBIDDEN", "RESOURCE_NOT_FOUND"]) {
    let definition, refreshes = 0; const timers = new Map();
    const item = { id: "video", status: "UPLOADING", mediaType: "VIDEO", occurredAt: new Date().toISOString(), media: [] };
    const state = { profile: { id: "me" }, couple: { id: "pair", status: "PAIRED" }, moments: [item], messages: [] };
    load("miniprogram/pages-main/time/index.ts", {
      "../../core/store": { store: { getState: () => state, removeRemoteMoment(id) { state.moments = state.moments.filter(value => value.id !== id); } } },
      "../../services/app-service": { appService: { isRemote: true, hasSession: () => true, async refresh() { refreshes++; throw new Error("offline sync"); }, async detail() { throw Object.assign(new Error(code), { code }); } }, redirectExpiredSession: () => false, userError: error => error.message }
    }, { Page(value) { definition = value; }, wx: { stopPullDownRefresh() {} }, setTimeout(callback) { timers.set(1, callback); return 1; }, clearTimeout(id) { timers.delete(id); } });
    const page = { ...definition, visible: true, remoteMoments: [item], data: { ...definition.data, moments: [item] }, setData(patch) { Object.assign(this.data, patch); } };
    page.scheduleMediaRefresh(); const callback = timers.get(1); timers.delete(1); await callback();
    assert.equal(refreshes, code === "NETWORK_ERROR" ? 0 : 1); assert.equal(timers.size, code === "NETWORK_ERROR" ? 1 : 0);
    if (code === "NETWORK_ERROR") assert.equal(page.data.moments[0], item);
    else { assert.equal(state.moments.length, 0); assert.equal(page.remoteMoments.length, 0); assert.equal(page.data.moments.length, 0); assert.equal(page.data.error, "offline sync"); }
  }
});

test("forgetting an asset cancels an in-flight cover save", async () => {
  const f = fixture({ deferred: true }); const pending = f.cache.remember("me", "revoked", firstUrl);
  f.cache.forget("me", "revoked", firstUrl);
  f.requests[0].success({ path: "wxfile://temp/0.jpg", type: "jpeg" });
  assert.equal(await pending, firstUrl); assert.equal(f.cache.get("me", "revoked", firstUrl), undefined);
});

test("removing an unauthorized record forgets only its cached media and saved metadata", async () => {
  const f = fixture();
  const { store } = load("miniprogram/core/store.ts", { "./api-config": { API_CONFIG: { useRemoteApi: true } }, "./media-cache": { mediaCache: f.cache } }, { wx: f.wx });
  store.applyRemoteProfile({ id: "me", name: "我" });
  const original = "https://bucket.cos.test/original/video.jpg";
  await f.cache.remember("me", "video", firstUrl); await f.cache.remember("me", "video", original);
  const other = await f.cache.remember("me", "other", firstUrl);
  store.upsertRemoteMoment({ id: "revoked", media: [{ id: "video", assetId: "video", path: original, thumbnailPath: firstUrl }] });
  store.upsertRemoteMoment({ id: "allowed", media: [{ id: "other", assetId: "other", path: firstUrl }] });
  store.removeRemoteMoment("revoked");
  assert.equal(store.getMoment("revoked"), undefined); assert.equal(store.getMoment("allowed").id, "allowed");
  assert.equal(f.cache.get("me", "video", firstUrl), undefined); assert.equal(f.cache.get("me", "video", original), undefined);
  assert.equal(f.cache.get("me", "other", firstUrl), other);
});
