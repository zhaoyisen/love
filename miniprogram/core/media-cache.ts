const STORAGE_KEY = "love-notes:cover-cache:v1";
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_FILES = 100;
// 详情也复用完整照片；单张与上传的 20MB 上限一致，总缓存仍限制为 32MB。
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface Entry { owner: string; assetId: string; path: string; size: number; usedAt: number }
let entries: Record<string, Entry> | undefined;
let generation = 0;
let active = 0;
const pending = new Map<string, Promise<string>>();
const queue: Array<() => void> = [];

function directory() { return `${wx.env.USER_DATA_PATH}/media-cover-cache`; }
function isCacheFile(path: string) {
  const prefix = `${directory()}/`;
  return path.startsWith(prefix) && /^\d+-[a-z0-9]+\.(jpg|png|webp)$/.test(path.slice(prefix.length));
}
function key(owner: string, assetId: string, url: string) {
  // COS 签名每次刷新都会变化；同一资产、同一对象的封面只保存一份。
  return `${owner}|${assetId}|${url.split("?")[0]}`;
}
function unexpiredUrl(url: string) {
  try {
    const match = url.match(/[?&]q-key-time=([^&]+)/);
    const expires = match ? Number(decodeURIComponent(match[1]).split(";")[1]) * 1000 : 0;
    return Number.isFinite(expires) && expires > Date.now();
  } catch (_) { return false; }
}
function unlink(path: string) {
  if (!isCacheFile(path)) return;
  try { wx.getFileSystemManager().unlinkSync(path); } catch (_) {}
}
function persist() {
  try { wx.setStorageSync(STORAGE_KEY, entries); } catch (_) {}
}
function load() {
  if (entries) return entries;
  entries = {};
  try {
    const saved = wx.getStorageSync(STORAGE_KEY) || {};
    Object.keys(saved).forEach((id) => {
      const entry = saved[id] as Entry;
      if (!entry || typeof entry.path !== "string" || !isCacheFile(entry.path)) return;
      if (typeof entry.owner !== "string" || typeof entry.assetId !== "string" || !Number.isFinite(entry.size) || entry.size <= 0
          || !Number.isFinite(entry.usedAt) || Date.now() - entry.usedAt > MAX_AGE_MS) { unlink(entry.path); return; }
      entries![id] = entry;
    });
  } catch (_) {}
  return entries;
}
function prune() {
  const cache = load();
  const oldest = Object.keys(cache).sort((a, b) => cache[a].usedAt - cache[b].usedAt);
  let bytes = oldest.reduce((sum, id) => sum + cache[id].size, 0);
  while (oldest.length > MAX_FILES || bytes > MAX_BYTES) {
    const id = oldest.shift()!;
    bytes -= cache[id].size;
    unlink(cache[id].path);
    delete cache[id];
  }
}
function drain() {
  while (active < 3 && queue.length) { active++; queue.shift()!(); }
}

export const mediaCache = {
  isUrlCurrent: unexpiredUrl,
  get(owner: string, assetId: string, url?: string, requireUnexpiredUrl = false): string | undefined {
    if (!owner || !assetId || !url || !wx.env?.USER_DATA_PATH) return;
    // 对方的封面不能借本地缓存延长授权窗口，签名过期后等服务端返回新的可读 URL。
    if (requireUnexpiredUrl && !unexpiredUrl(url)) return;
    const id = key(owner, assetId, url);
    const entry = load()[id];
    if (!entry) return;
    try {
      if (Date.now() - entry.usedAt > MAX_AGE_MS) throw new Error("expired");
      wx.getFileSystemManager().accessSync(entry.path);
      entry.usedAt = Date.now();
      return entry.path;
    } catch (_) {
      this.forget(owner, assetId, url);
      return;
    }
  },
  remember(owner: string, assetId: string, url: string, requireUnexpiredUrl = false): Promise<string> {
    if (requireUnexpiredUrl && !unexpiredUrl(url)) return Promise.resolve(url);
    const cached = this.get(owner, assetId, url, requireUnexpiredUrl);
    if (cached) return Promise.resolve(cached);
    if (!owner || !assetId || !/^https:\/\//.test(url) || !wx.env?.USER_DATA_PATH || !wx.getImageInfo) return Promise.resolve(url);
    const id = key(owner, assetId, url);
    const existing = pending.get(id);
    if (existing) return existing;
    const started = generation;
    let resolve!: (path: string) => void;
    const promise = new Promise<string>((done) => { resolve = done; });
    pending.set(id, promise);
    queue.push(() => {
      let finished = false;
      const finish = (path: string) => {
        if (finished) return;
        finished = true;
        if (pending.get(id) === promise) pending.delete(id);
        active--;
        resolve(path);
        drain();
      };
      if (started !== generation || pending.get(id) !== promise) { finish(url); return; }
      try {
        wx.getImageInfo({ src: url, success: (image: any) => {
          let path = "";
          try {
            if (started !== generation || pending.get(id) !== promise) { finish(url); return; }
            const fs = wx.getFileSystemManager();
            const size = fs.statSync(image.path).size;
            if (!Number.isFinite(size) || size <= 0 || size > MAX_FILE_BYTES) { finish(url); return; }
            try { fs.accessSync(directory()); } catch (_) { fs.mkdirSync(directory(), true); }
            path = `${directory()}/${Date.now()}-${Math.random().toString(36).slice(2)}.${image.type === "webp" ? "webp" : image.type === "png" ? "png" : "jpg"}`;
            fs.copyFileSync(image.path, path);
            load()[id] = { owner, assetId, path, size, usedAt: Date.now() };
            prune();
            persist();
            finish(path);
          } catch (_) { if (path) unlink(path); finish(url); }
        }, fail: () => finish(url) });
      } catch (_) { finish(url); }
    });
    drain();
    return promise;
  },
  forget(owner: string, assetId: string, url: string) {
    const id = key(owner, assetId, url);
    const entry = load()[id];
    if (entry) { unlink(entry.path); delete entries![id]; persist(); }
  },
  retain(owner: string, assetIds: string[]) {
    const allowed = new Set(assetIds);
    // 普通刷新保留仍有权限的下载，仅取消已失去权限的资产。
    for (const id of pending.keys()) {
      const [entryOwner, assetId] = id.split("|");
      if (entryOwner !== owner || !allowed.has(assetId)) pending.delete(id);
    }
    Object.keys(load()).forEach((id) => {
      const entry = entries![id];
      if (entry.owner !== owner || !allowed.has(entry.assetId)) { unlink(entry.path); delete entries![id]; }
    });
    persist();
  },
  clear() {
    generation++;
    pending.clear();
    Object.values(load()).forEach((entry) => unlink(entry.path));
    entries = {};
    try {
      const fs = wx.getFileSystemManager();
      fs.readdirSync(directory()).forEach((name: string) => unlink(`${directory()}/${name}`));
      wx.removeStorageSync(STORAGE_KEY);
    } catch (_) {}
  }
};
