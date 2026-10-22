const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const test = require("node:test"), ts = require("typescript");
function load(file, dependencies = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", file), exports = {};
  const code = ts.transpileModule(fs.readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  vm.runInNewContext(code, { exports, console, Date, setTimeout, clearTimeout, require(name) { assert.ok(name in dependencies, name); return dependencies[name]; }, ...globals }, { filename });
  return exports;
}
function detailFixture() {
  const moment = { id: "m", author: "我", mediaType: "IMAGE", status: "PUBLISHED", occurredAt: new Date().toISOString(), events: [], comments: [], media: [{ id: "photo", assetId: "photo", status: "READY", path: "https://cos/display.webp", thumbnailPath: "https://cos/thumb.webp" }] };
  const state = { loggedIn: true, profile: { id: "me", avatarUrl: "avatar-me" }, couple: { partnerName: "TA", partnerAvatarUrl: "avatar-ta" } };
  const service = { isRemote: true, hasSession: () => true, detail: async () => moment };
  const cache = { get(_owner, _id, url) { return url?.includes("display") ? "wxfile://cached-display" : "wxfile://cached-thumb"; }, remember: async (_owner, _id, url) => url, forget() {} };
  let page;
  load("miniprogram/pkg-moment/detail/index.ts", { "../../core/store": { store: { getState: () => state, getMoment: () => moment } }, "../../core/media-cache": { mediaCache: cache }, "../../core/format": load("miniprogram/core/format.ts"), "../../services/app-service": { appService: service, redirectExpiredSession: () => false, userError: error => error.message } }, { Page(value) { page = value; }, wx: { showToast() {}, getWindowInfo: () => ({ windowHeight: 700 }) } });
  page.data = structuredClone(page.data); page.setData = function (patch) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.replace(/\[(\d+)\]/g, ".$1").split(".");
      parts.slice(0, -1).reduce((target, part) => target[part], this.data)[parts.at(-1)] = value;
    }
  }; page.onLoad({ id: "m" });
  return { page, service, moment, cache, state };
}

test("detail metadata can rotate signatures without restarting the same displayed photo", () => {
  const f = detailFixture(); f.cache.get = () => undefined;
  f.page.renderMoment(f.moment);
  const source = f.moment.media[0].path;
  f.page.renderMoment({ ...f.moment, body: "新短评", media: [{ ...f.moment.media[0], path: source + "?signature=rotated" }] });
  assert.equal(f.page.data.moment.media[0].path, source);
  assert.equal(f.page.data.moment.media[0].sourcePath, source + "?signature=rotated");
  f.page.renderMoment({ ...f.moment, media: [{ ...f.moment.media[0], path: "https://cos/replaced.webp" }] });
  assert.equal(f.page.data.moment.media[0].path, "https://cos/replaced.webp");
});

test("a failed displayed photo can retry with the next signed URL instead of keeping the broken source", () => {
  const f = detailFixture(); f.cache.get = () => undefined;
  f.page.renderMoment(f.moment); f.page.imageError({ currentTarget: { dataset: { index: 0 } }, detail: { errMsg: "expired signature" } });
  const fresh = f.moment.media[0].path + "?signature=fresh";
  f.page.renderMoment({ ...f.moment, media: [{ ...f.moment.media[0], path: fresh }] });
  assert.equal(f.page.data.moment.media[0].path, fresh);
});

test("detail does not retain a partner photo after its current media authorization expires", () => {
  const f = detailFixture(); f.moment.author = "TA";
  f.cache.get = (_owner, _id, url) => url && !url.includes("expired") ? "wxfile://saved-photo" : undefined;
  f.cache.isUrlCurrent = url => !url.includes("expired");
  f.page.renderMoment(f.moment); assert.equal(f.page.data.moment.media[0].path, "wxfile://saved-photo");
  f.page.renderMoment({ ...f.moment, media: [{ ...f.moment.media[0], path: f.moment.media[0].path + "?expired", thumbnailPath: "" }] });
  assert.equal(f.page.data.moment.media[0].path, f.moment.media[0].path + "?expired");
});

test("detail saves the viewed photo rather than letting unseen originals evict it", async () => {
  const f = detailFixture(), saved = []; f.cache.get = () => undefined;
  f.cache.remember = async (_owner, id, url) => { saved.push(id); return url; };
  f.moment.media = Array.from({ length: 9 }, (_, index) => ({ id: "photo-" + index, assetId: "photo-" + index, status: "READY", path: "https://cos/photo-" + index + ".webp" }));
  f.page.renderMoment(f.moment); assert.equal(saved.join(), "photo-0");
  f.page.mediaChange({ detail: { current: 1 } }); await new Promise(resolve => setImmediate(resolve)); assert.equal(saved.join(), "photo-0,photo-1");
});

test("detail finishes an older save before starting the latest viewed photo so LRU cannot evict the current one out of order", async () => {
  const f = detailFixture(), started = [], finish = {}; f.cache.get = () => undefined;
  f.cache.remember = (_owner, id) => { started.push(id); return new Promise(resolve => { finish[id] = resolve; }); };
  f.moment.media = Array.from({ length: 3 }, (_, index) => ({ id: "photo-" + index, assetId: "photo-" + index, status: "READY", path: "https://cos/photo-" + index + ".webp" }));
  f.page.renderMoment(f.moment); f.page.mediaChange({ detail: { current: 1 } }); f.page.mediaChange({ detail: { current: 2 } });
  assert.equal(started.join(), "photo-0");
  finish["photo-0"]("wxfile://saved-0"); await new Promise(resolve => setImmediate(resolve)); assert.equal(started.join(), "photo-0,photo-2");
  finish["photo-2"]("wxfile://saved-2"); await new Promise(resolve => setImmediate(resolve));
});

test("an earlier valid download cannot restore a partner photo after its latest signed URL expires", async () => {
  const f = detailFixture(); f.moment.author = "TA"; let finish;
  const source = f.moment.media[0].path;
  f.cache.get = () => undefined; f.cache.isUrlCurrent = url => url.includes("?valid");
  f.cache.remember = (_owner, _id, url) => url.includes("?valid") ? new Promise(resolve => { finish = resolve; }) : Promise.resolve(url);
  f.page.renderMoment({ ...f.moment, media: [{ ...f.moment.media[0], path: source + "?valid", thumbnailPath: "" }] });
  f.page.renderMoment({ ...f.moment, media: [{ ...f.moment.media[0], path: source + "?expired", thumbnailPath: "" }] });
  f.cache.get = (_owner, _id, url) => url?.includes("?valid") ? "wxfile://saved-photo" : undefined;
  finish("wxfile://saved-photo"); await Promise.resolve(); await Promise.resolve();
  assert.equal(f.page.data.moment.media[0].path, source + "?expired");
});

test("a queued photo save cannot start after the account or session changes", async () => {
  const f = detailFixture(), started = []; let finish;
  f.cache.get = () => undefined;
  f.cache.remember = (_owner, id) => { started.push(id); return new Promise(resolve => { finish = resolve; }); };
  f.moment.media.push({ ...f.moment.media[0], id: "next", assetId: "next", path: "https://cos/next.webp" });
  f.page.renderMoment(f.moment); f.page.mediaChange({ detail: { current: 1 } });
  f.state.profile.id = "other"; f.service.hasSession = () => false; finish("wxfile://old");
  await new Promise(resolve => setImmediate(resolve)); assert.equal(started.join(), "photo");
});
test("detail displays cached full-size photos while its metadata synchronizes", async () => {
  const f = detailFixture(); let finish;
  f.service.detail = () => new Promise(resolve => { finish = resolve; });
  const refresh = f.page.refresh();
  assert.equal(f.page.data.moment.id, "m");
  assert.equal(f.page.data.moment.media[0].path, "wxfile://cached-display");
  finish(f.moment); await refresh;
  assert.equal(f.page.data.moment.media[0].path, "wxfile://cached-display");
});

test("detail carries the saved avatars into author and comment rendering", async () => {
  const f = detailFixture(); await f.page.refresh();
  assert.equal(f.page.data.myAvatarUrl, "avatar-me");
  assert.equal(f.page.data.partnerAvatarUrl, "avatar-ta");
});

test("media readiness polling stops on rejection and reports a bounded pending timeout", async () => {
  for (const outcome of ["READY", "BLOCKED", "FAILED", "PROCESSING"]) {
    let calls = 0;
    const { mediaService } = load("miniprogram/services/media-service.ts", {
      "./request": { apiRequest: async () => { calls++; return { id: "image", status: outcome }; } },
      "../vendor/cos-wx-sdk-v5.min.js": class {}
    }, { setTimeout(resolve) { resolve(); } });
    if (outcome === "READY") assert.equal((await mediaService.waitUntilReady("image")).id, "image");
    else await assert.rejects(mediaService.waitUntilReady("image"), /安全检测|处理失败|仍在安全处理/);
    assert.equal(calls, outcome === "PROCESSING" ? 30 : 1);
  }
});
test("profile save waits for avatar readiness and persists the server image, not the chooser temporary file", async () => {
  let page, waited = 0; const saved = [], state = { profile: { name: "我" } };
  load("miniprogram/pkg-profile/edit/index.ts", {
    "../../core/store": { store: { getState: () => state, update: mutate => mutate(state) } },
    "../../services/media-service": { mediaService: { upload: async () => ({ asset: { id: "avatar", status: "PROCESSING" } }), waitUntilReady: async id => { waited++; assert.equal(id, "avatar"); return { id, status: "READY", access_url: "https://cos/ready-avatar" }; } } },
    "../../services/app-service": { appService: { isRemote: true, updateProfile: async (...args) => saved.push(args) }, redirectExpiredSession: () => false, userError: error => error.message }
  }, { Page(value) { page = value; }, wx: { getFileInfo: options => options.success({ size: 1024 }), showToast() {}, navigateBack() {} }, setTimeout: () => 1 });
  page.data = structuredClone(page.data); page.setData = function (patch) { Object.assign(this.data, patch); }; page.onLoad();
  page.chooseWechatAvatar({ detail: { avatarUrl: "wxfile://temporary.jpg" } }); await page.save();
  assert.equal(waited, 1);
  assert.equal(saved[0][1], "avatar");
  assert.equal(saved[0][2], "https://cos/ready-avatar");
});
test("blocked avatars do not report a successful profile save", async () => {
  let page, saved = false;const state={profile:{name:"我"}};
  load("miniprogram/pkg-profile/edit/index.ts", {
    "../../core/store": { store: { getState: () => state, update: mutate => mutate(state) } },
    "../../services/media-service": { mediaService: { upload: async () => ({ asset: { id: "avatar", status: "BLOCKED" } }), waitUntilReady: async () => { throw new Error("头像未通过安全检测，请重新选择"); } } },
    "../../services/app-service": { appService: { isRemote: true, updateProfile: async () => { saved = true; } }, redirectExpiredSession: () => false, userError: error => error.message }
  }, { Page(value) { page = value; }, wx: { getFileInfo: options => options.success({ size: 1024 }), showToast() {}, navigateBack() {} }, setTimeout: () => 1 });
  page.data = structuredClone(page.data); page.setData = function (patch) { Object.assign(this.data, patch); }; page.onLoad();
  page.chooseWechatAvatar({ detail: { avatarUrl: "wxfile://temporary.jpg" } }); await page.save();
  assert.equal(saved, false); assert.match(page.data.error, /安全检测/);
});

test("a pending avatar survives closing the editor and resumes without uploading again",async()=>{
  const state={profile:{id:"me",name:"我"}};let page,uploads=0,ready=false;const saved=[];
  const dependencies={
    "../../core/store":{store:{getState:()=>state,update:mutate=>mutate(state)}},
    "../../services/media-service":{mediaService:{upload:async()=>{uploads++;return {asset:{id:"pending-avatar"}}},waitUntilReady:async id=>{if(!ready)throw new Error("图片仍在安全处理中");return {id,access_url:"https://cos/avatar"}}}},
    "../../services/app-service":{appService:{isRemote:true,updateProfile:async(...args)=>saved.push(args)},redirectExpiredSession:()=>false,userError:error=>error.message}
  };
  function open(){load("miniprogram/pkg-profile/edit/index.ts",dependencies,{Page(value){page=value},wx:{getFileInfo:options=>options.success({size:1024}),showToast(){},navigateBack(){}},setTimeout:()=>1});page.data=structuredClone(page.data);page.setData=function(patch){Object.assign(this.data,patch)};page.onLoad()}
  open();page.chooseWechatAvatar({detail:{avatarUrl:"wxfile://avatar.jpg"}});await page.save();page.onUnload();
  open();assert.equal(page.data.canSubmit,true);ready=true;await page.save();
  assert.equal(uploads,1);assert.equal(saved[0][1],"pending-avatar");assert.equal(state.profile.pendingAvatarId,undefined);
});

function albumServiceFixture() {
  const state = { loggedIn: true, profile: { id: "me" }, couple: { id: "pair", status: "PAIRED" }, moments: [] };
  const calls = { uploaded: [], attached: [] };
  const mediaService = { async upload(file) { calls.uploaded.push(file); return { asset: { id: "photo", status: "PROCESSING" } }; } };
  const coupleService = { async addAlbumPhotos(coupleId, ids) { calls.attached.push({ coupleId, ids }); }, async albumPhotos() { return [{ id: "photo", uploader_id: "me", status: "PROCESSING", created_at: new Date().toISOString() }]; } };
  coupleService.albumCapacity = async () => ({used:1});
  const dependencies = {
    "../core/api-config": { API_CONFIG: { useRemoteApi: true } }, "../core/mock-api": {},
    "../core/store": { store: { getState: () => state, update: mutate => mutate(state) } },
    "./request": { hasSession: () => true }, "./media-service": { mediaService },
    "./couple-service": { coupleService }
  };
  for (const name of ["auth", "compliance", "message", "moment", "pet", "recap", "notification-preference", "template-render"]) dependencies[`./${name}-service`] = {};
  dependencies["../core/couple-album"] = load("miniprogram/core/couple-album.ts");
  const { appService } = load("miniprogram/services/app-service.ts", dependencies, { wx: { getImageInfo(options) { options.success({ type: "png" }); } } });
  return { appService, mediaService, coupleService, state, calls };
}

test("album responses preserve the original upload separately from processed display images", async () => {
  const f = albumServiceFixture();
  f.coupleService.albumPhotos = async () => [{ id: "photo", uploader_id: "me", status: "READY", thumbnail_url: "https://cos/thumb.webp", access_url: "https://cos/display.webp", original_url: "https://cos/original.jpg" }];
  const photos = await f.appService.albumPhotos();
  assert.equal(photos[0].source, "https://cos/thumb.webp"); assert.equal(photos[0].original, "https://cos/original.jpg");
  assert.equal(f.state.album.photos[0].original, "https://cos/original.jpg");
  f.coupleService.albumPhotos = async () => [{ id: "photo", uploader_id: "me", status: "READY", original_url: "https://cos/original-only.jpg" }];
  assert.equal((await f.appService.albumPhotos())[0].source, "https://cos/original-only.jpg");
  f.coupleService.albumPhotos = async () => [{ id: "legacy", uploader_id: "me", status: "READY", access_url: "https://cos/legacy-display.webp" }];
  assert.equal((await f.appService.albumPhotos())[0].original, "https://cos/legacy-display.webp");
});

test("album deletion removes only the selected own photo after server success and keeps failures", async () => {
  const f=albumServiceFixture();
  const photo={key:"album:own",assetId:"own",author:"我",source:"https://cos/own",original:"https://cos/own",status:"READY"};
  const partner={...photo,key:"album:partner",assetId:"partner",author:"TA"};
  f.state.album={coupleId:"pair",photos:[photo,partner]};
  let requests=[];f.coupleService.deleteAlbumPhoto=async(coupleId,id)=>{requests.push({coupleId,id});throw new Error("离线")};
  await assert.rejects(f.appService.deleteAlbumPhoto("own"),/离线/);assert.equal(f.state.album.photos.length,2);
  await assert.rejects(f.appService.deleteAlbumPhoto("partner"),/自己上传/);assert.equal(requests.length,1);
  f.coupleService.deleteAlbumPhoto=async(coupleId,id)=>{requests.push({coupleId,id})};
  await f.appService.deleteAlbumPhoto("own");assert.equal(f.state.album.photos.length,1);assert.equal(f.state.album.photos[0].assetId,"partner");
  assert.deepEqual(requests.at(-1),{coupleId:"pair",id:"own"});
});

test("a late album delete cannot change another account, relationship or logged-out cache", async () => {
  for(const changed of ["account","couple","logout"]){
    const f=albumServiceFixture();const photo={key:"album:own",assetId:"own",author:"我"};f.state.album={coupleId:"pair",photos:[photo]};
    let finish;f.coupleService.deleteAlbumPhoto=()=>new Promise(resolve=>{finish=resolve});const pending=f.appService.deleteAlbumPhoto("own");
    if(changed==="account")f.state.profile.id="other";if(changed==="couple")f.state.couple.id="other";if(changed==="logout")f.state.loggedIn=false;
    finish();await assert.rejects(pending,/空间已变化|登录/);assert.equal(f.state.album.photos.length,1);
  }
});

test("a stale album from another relationship cannot initiate deletion",async()=>{
  const f=albumServiceFixture();f.state.album={coupleId:"old-pair",photos:[{assetId:"own",author:"我"}]};
  let requests=0;f.coupleService.deleteAlbumPhoto=async()=>{requests++};
  await assert.rejects(f.appService.deleteAlbumPhoto("own"),/当前共同相册/);assert.equal(requests,0);
});

test("an album response started before deletion cannot restore the deleted photo",async()=>{
  const f=albumServiceFixture();f.state.album={coupleId:"pair",photos:[{assetId:"own",author:"我"}]};
  let finish;f.coupleService.albumPhotos=()=>new Promise(resolve=>{finish=resolve});const pending=f.appService.albumPhotos();
  f.coupleService.deleteAlbumPhoto=async()=>{};await f.appService.deleteAlbumPhoto("own");
  finish([{id:"own",uploader_id:"me",status:"READY",access_url:"https://cos/deleted"}]);
  await assert.rejects(pending,/相册已更新/);assert.equal(f.state.album.photos.length,0);
});

test("late album URLs are not stored after an account, relationship or login change", async () => {
  for (const changed of ["account", "couple", "ended", "logout"]) {
    const f = albumServiceFixture(); let finish;
    f.coupleService.albumPhotos = () => new Promise(resolve => { finish = resolve; });
    const request = f.appService.albumPhotos();
    if (changed === "account") f.state.profile.id = "other";
    if (changed === "couple") f.state.couple.id = "new-pair";
    if (changed === "ended") f.state.couple.status = "ENDED";
    if (changed === "logout") f.state.loggedIn = false;
    finish([{ id: "private", uploader_id: "me", status: "READY", original_url: "https://cos/original.jpg" }]);
    await assert.rejects(request, /空间已变化|登录/, changed); assert.equal(f.state.album, undefined, changed);
  }
});
test("album upload uses the actual image format and stores photos without publishing moments", async () => {
  const f = albumServiceFixture();
  await f.appService.uploadAlbumPhotos([{ tempFilePath: "wxfile://temporary.jpg", size: 1024 }], () => {});
  assert.equal(f.calls.uploaded[0].mimeType, "image/png");
  assert.equal(f.calls.attached[0].coupleId, "pair");
  assert.equal(f.state.moments.length, 0); assert.equal(f.state.album.photos[0].status, "PROCESSING");
});
test("a relationship change during upload stops attachment to the newly active space", async () => {
  const f = albumServiceFixture();
  f.mediaService.upload = async () => { f.state.couple.id = "new-pair"; return { asset: { id: "photo", status: "READY" } }; };
  await assert.rejects(f.appService.uploadAlbumPhotos([{ tempFilePath: "wxfile://photo.jpg", size: 1024 }], () => {}), /空间已变化/);
  assert.equal(f.calls.attached.length, 0);
});
test("oversized album photos are rejected before uploading", async () => {
  const f = albumServiceFixture();
  await assert.rejects(f.appService.uploadAlbumPhotos([{ tempFilePath: "wxfile://photo.jpg", size: 21 * 1024 * 1024 }], () => {}), /20MB/);
  assert.equal(f.calls.uploaded.length, 0);
});

test("a detail response cannot be cached under a changed account, relationship or session", async () => {
  for (const changed of ["account", "couple", "ended", "session", "unchanged"]) {
    const state = { profile: { id: "me" }, couple: { id: "pair", status: "PAIRED" } }; let finish, session = true; const saved = [];
    const dependencies = { "../core/api-config": { API_CONFIG: { useRemoteApi: true } }, "../core/mock-api": {}, "../core/store": { store: { getState: () => state, upsertRemoteMoment: value => saved.push(value) } }, "./request": { hasSession: () => session }, "./moment-service": { momentService: { detail: () => new Promise(resolve => { finish = resolve; }) } } };
    for (const name of ["auth", "compliance", "couple", "media", "message", "pet", "recap", "notification-preference", "template-render"]) dependencies[`./${name}-service`] = {};
    dependencies["../core/couple-album"] = load("miniprogram/core/couple-album.ts");
    const { appService } = load("miniprogram/services/app-service.ts", dependencies);
    const request = appService.detail("video");
    if (changed === "account") state.profile.id = "other";
    if (changed === "couple") state.couple.id = "new-pair";
    if (changed === "ended") state.couple.status = "ENDED";
    if (changed === "session") session = false;
    finish({ id: "video", author_id: "me", type: "VIDEO", media: [], occurred_at: new Date().toISOString() });
    if (changed === "unchanged") { await request; assert.equal(saved.length, 1); assert.equal(saved[0].author, "我"); }
    else { await assert.rejects(request, /账号或情侣空间已变化/); assert.equal(saved.length, 0, changed); }
  }
});
