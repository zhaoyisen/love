import { store } from "../../core/store";
import { albumPhotos, albumSlots } from "../../core/couple-album";
import { mediaCache } from "../../core/media-cache";
import type { AlbumPhoto } from "../../core/types";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { couple: {} as any, unread: 0, days: 0, myInitial: "我", myAvatarUrl: "", partnerInitial: "TA", partnerAvatarUrl: "", loading: false, loaded: false, error: "", isRemote: appService.isRemote,
    albumColumns: [[], []] as any[][], albumCount: 0, albumOffset: 0, albumLoading: false, albumOwner: "",
    albumUploading: false, albumUploadText: "上传照片", albumPending: 0, albumFailed: 0, albumRetrying: false,
    albumManaging: false, albumCanManage: false, albumDeleting: "", albumRemaining: 6, albumSaving: false,
    albumDragging: false, albumDragKey: "", albumDropKey: "", albumDragPhoto: {} as any, albumDragLeft: 0, albumDragTop: 0,
    albumDragWidth: 0, albumDragHeight: 0, myAvatarError: false, partnerAvatarError: false },
  dragSession: null as any,
  touchSequence: 0,
  touchActive: false,
  draftAlbumOrder: undefined as string[] | undefined,
  requestId: 0,
  albumScope: "",
  remoteAlbum: [] as any[],
  remotePhotos: [] as AlbumPhoto[],
  albumTimer: null as any,
  albumPollCount: 0,
  albumVisible: false,
  syncVersion: "",
  async onShow(force = false) {
    this.cancelAlbumDrag();
    this.albumVisible = true;
    this.albumPollCount = 0;
    clearTimeout(this.albumTimer);
    const requestId = ++this.requestId;
    if (this.albumScope !== this.currentAlbumScope()) this.setData({ albumManaging: false, albumDeleting: "" });
    const saved = store.getState().album;
    if (saved && saved.coupleId === store.getState().couple.id) this.remotePhotos = saved.photos;
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 1 });
    const initial = !this.data.loaded || this.albumScope !== this.currentAlbumScope();
    let updated = initial;
    if (initial || force === true) {
      this.setData({ loading: true, error: "", albumRetrying: false }); this.render();
    }
    try {
      const synced = await appService.refreshIfChanged(force === true);
      if (requestId !== this.requestId) return;
      if (this.data.error) this.setData({ error: "" });
      if (!initial && force !== true && this.syncVersion === synced.version) return;
      updated = true;
      this.render();
      if (store.getState().couple.status === "PAIRED") {
        const scope = this.currentAlbumScope();
        this.setData({ albumLoading: true, loaded: true });
        const [moments, photos] = await Promise.all([appService.album(), appService.albumPhotos()]);
        if (requestId !== this.requestId || scope !== this.currentAlbumScope()) return;
        this.remoteAlbum = moments;
        this.remotePhotos = photos;
        this.albumScope = scope;
      }
      this.syncVersion = synced.version;
    } catch (error) {
      if (requestId === this.requestId && !redirectExpiredSession()) this.setData({ error: userError(error, "情侣空间同步失败，当前展示最近一次保存的状态。") });
    } finally {
      if (requestId === this.requestId) {
        if (updated) this.render(); this.setData({ loading: false, loaded: true, albumLoading: false });
        wx.stopPullDownRefresh();
        this.scheduleAlbumRefresh();
      }
    }
  },
  onHide() { this.requestId++; this.albumVisible = false; this.cancelAlbumDrag(); clearTimeout(this.albumTimer); },
  onUnload() { this.onHide(); },
  onPullDownRefresh() { return this.onShow(true); },
  onPageScroll(event: any) {
    const albumOffset = Math.min(12, Math.max(0, Math.round(event.scrollTop * .035)));
    if (albumOffset !== this.data.albumOffset) this.setData({ albumOffset });
  },
  currentAlbumScope() {
    const state = store.getState();
    return `${state.profile.id || "local"}:${state.couple.id || "local"}:${state.couple.status}`;
  },
  render() {
    const state = store.getState();
    const myAvatarUrl = mediaCache.stableUrl(this.data.myAvatarUrl, state.profile.avatarUrl, this.data.myAvatarError);
    const partnerAvatarUrl = mediaCache.stableUrl(this.data.partnerAvatarUrl, state.couple.partnerAvatarUrl, this.data.partnerAvatarError);
    const source = appService.isRemote ? this.albumScope === this.currentAlbumScope() && state.loggedIn && appService.hasSession() ? this.remoteAlbum : [] : state.moments;
    const authenticated = state.loggedIn && (!appService.isRemote || appService.hasSession());
    const owner = authenticated ? state.profile.id || "" : "";
    const uploads = this.albumScope === this.currentAlbumScope() ? this.remotePhotos
      : state.album?.coupleId === (state.couple.id || "local") ? state.album.photos : [];
    const allowedUploads = authenticated ? uploads : [];
    const reserved = authenticated && state.couple.status === "PAIRED" && state.album?.coupleId === state.couple.id ? state.album?.used || 0 : 0;
    const preview = albumPhotos(source, state.couple.status, allowedUploads, this.draftAlbumOrder || state.couple.albumOrder);
    const ownUploads = allowedUploads.filter(photo => photo.author === "我" && !photo.momentId && (!photo.status || photo.status === "READY"));
    const previous = this.data.albumOwner === owner && this.albumScope === this.currentAlbumScope() ? this.data.albumColumns.flat() : [];
    const photos = (this.data.albumManaging && state.couple.status === "PAIRED" ? ownUploads : preview).map((photo, index) => {
      const shown = previous.find(value => value.key === photo.key && !value.error
        && (photo.author !== "TA" || mediaCache.isUrlCurrent(photo.source))
        && value.original.split("?")[0] === photo.original.split("?")[0]
        && (value.source.split("?")[0] === photo.source.split("?")[0] || value.source.split("?")[0] === photo.original.split("?")[0]));
      const originalFallback = shown && shown.source.split("?")[0] === photo.original.split("?")[0];
      return { ...photo, source: originalFallback ? photo.original : photo.source,
        path: shown?.path || mediaCache.get(owner, photo.assetId, photo.source, photo.author === "TA") || photo.source,
        error: false, slot: index, aspect: ["portrait", "landscape", "landscape", "square", "wide", "landscape"][index % 6] };
    });
    const columns = [photos.filter((_photo, index) => index % 2 === 0), photos.filter((_photo, index) => index % 2 === 1)];
    const patch: Record<string, any> = {};
    if (columns.some((column, index) => column.length !== this.data.albumColumns[index].length
      || column.some((photo, row) => photo.key !== this.data.albumColumns[index][row]?.key))) patch.albumColumns = columns;
    else columns.forEach((column, index) => column.forEach((photo, row) => {
      for (const [field, value] of Object.entries(photo)) {
        if (value !== this.data.albumColumns[index][row][field]) patch[`albumColumns[${index}][${row}].${field}`] = value;
      }
    }));
    this.setData({
      ...patch, albumCount: photos.length, albumOwner: owner, albumCanManage: ownUploads.length > 0,
      albumRemaining: 6 - Math.min(6, Math.max(albumSlots(source, state.couple.status, allowedUploads), reserved)),
      albumPending: state.couple.status === "PAIRED" ? Math.max(allowedUploads.filter(photo => photo.status === "PROCESSING").length,
        Math.max(0, Math.min(6, reserved) - preview.length)) : 0,
      albumFailed: state.couple.status === "PAIRED" ? allowedUploads.filter(photo => photo.status === "FAILED" || photo.status === "BLOCKED").length : 0,
      couple: state.couple,
      unread: state.messages.filter((item) => !item.read).length,
      days: this.daysSince(state.couple.anniversary),
      myInitial: (state.profile.name || "我").slice(0, 1),
      myAvatarError: this.data.myAvatarUrl === myAvatarUrl && this.data.myAvatarError,
      ...(myAvatarUrl !== this.data.myAvatarUrl ? { myAvatarUrl } : {}),
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1),
      partnerAvatarError: this.data.partnerAvatarUrl === partnerAvatarUrl && this.data.partnerAvatarError,
      ...(partnerAvatarUrl !== this.data.partnerAvatarUrl ? { partnerAvatarUrl } : {})
    });
  },
  albumPhoto(event: any) {
    const { column, index } = event.currentTarget.dataset;
    return this.data.albumColumns[column]?.[index];
  },
  albumTouchStart() { this.touchActive = true; this.touchSequence++; },
  albumSequence() { return this.data.albumColumns.flat().slice().sort((a, b) => a.slot - b.slot); },
  async startAlbumDrag(event: any) {
    const photo = this.albumPhoto(event), point = event.touches?.[0];
    if (!this.touchActive || !photo || !point || this.data.albumCount < 2 || this.data.albumManaging || this.data.albumSaving
      || this.data.albumUploading || this.data.albumLoading || this.data.albumRetrying || !store.getState().loggedIn) return;
    const scope = this.currentAlbumScope(), touch = this.touchSequence;
    return new Promise<void>(resolve => {
      wx.createSelectorQuery().in(this).selectAll(".album-photo").boundingClientRect((rects: any[]) => {
        if (!this.albumVisible || !this.touchActive || touch !== this.touchSequence || scope !== this.currentAlbumScope()) { resolve(); return; }
        const rect = rects.find(rect => this.albumPhoto({ currentTarget: { dataset: rect.dataset } })?.key === photo.key);
        if (!rect) { resolve(); return; }
        clearTimeout(this.albumTimer);
        this.dragSession = { scope, rects, photo, offsetX: point.clientX - rect.left, offsetY: point.clientY - rect.top };
        this.setData({ albumDragging: true, albumDragKey: photo.key, albumDropKey: photo.key, albumDragPhoto: photo,
          albumDragLeft: rect.left, albumDragTop: rect.top, albumDragWidth: rect.width, albumDragHeight: rect.height });
        resolve();
      }).exec();
    });
  },
  moveAlbumDrag(event: any) {
    const drag = this.dragSession, point = event.touches?.[0];
    if (!drag || !point) return;
    if (drag.scope !== this.currentAlbumScope() || !this.albumVisible) { this.cancelAlbumDrag(); return; }
    const target = drag.rects.find((rect: any) => point.clientX >= rect.left && point.clientX <= rect.right
      && point.clientY >= rect.top && point.clientY <= rect.bottom);
    this.setData({ albumDragLeft: point.clientX - drag.offsetX, albumDragTop: point.clientY - drag.offsetY,
      albumDropKey: target ? this.albumPhoto({ currentTarget: { dataset: target.dataset } })?.key || "" : "" });
  },
  cancelAlbumDrag() {
    this.touchActive = false; this.touchSequence++; this.dragSession = null;
    if (this.data.albumDragging) this.setData({ albumDragging: false, albumDragKey: "", albumDropKey: "", albumDragPhoto: {} });
    this.scheduleAlbumRefresh();
  },
  async endAlbumDrag() {
    const drag = this.dragSession, targetKey = this.data.albumDropKey;
    this.cancelAlbumDrag();
    if (!drag || drag.scope !== this.currentAlbumScope() || !this.albumVisible || !targetKey || targetKey === drag.photo.key) return;
    const photos = this.albumSequence(), from = photos.findIndex(photo => photo.key === drag.photo.key), to = photos.findIndex(photo => photo.key === targetKey);
    if (from < 0 || to < 0) return;
    photos.splice(to, 0, photos.splice(from, 1)[0]);
    this.draftAlbumOrder = photos.map(photo => photo.assetId);
    this.setData({ albumSaving: true, error: "" }); this.render();
    try {
      await appService.reorderAlbumPhotos(this.draftAlbumOrder);
    } catch (error) {
      if (drag.scope === this.currentAlbumScope() && this.albumVisible && !redirectExpiredSession())
        this.setData({ error: userError(error, "排序没有保存，请重试。") });
    } finally {
      this.draftAlbumOrder = undefined;
      this.setData({ albumSaving: false });
      if (drag.scope === this.currentAlbumScope() && this.albumVisible) { this.render(); this.scheduleAlbumRefresh(); }
    }
  },
  async albumPhotoLoaded(event: any) {
    const photo = this.albumPhoto(event);
    if (!photo || photo.path !== photo.source || !appService.hasSession() || this.data.albumOwner !== store.getState().profile.id
      || this.albumScope !== this.currentAlbumScope()) return;
    // 缓存供下次进入使用，当前已经显示的图片不切换 src。
    await mediaCache.remember(this.data.albumOwner, photo.assetId, photo.source, photo.author === "TA");
  },
  albumPhotoError(event: any) {
    const photo = this.albumPhoto(event);
    if (!photo) return;
    const { column, index } = event.currentTarget.dataset;
    const key = `albumColumns[${column}][${index}]`;
    if (photo.path !== photo.source) {
      mediaCache.forget(this.data.albumOwner, photo.assetId, photo.source);
      this.setData({ [`${key}.path`]: photo.source });
    } else if (photo.source !== photo.original) {
      this.setData({ [`${key}.source`]: photo.original, [`${key}.path`]: photo.original });
    } else this.setData({ [`${key}.error`]: true });
  },
  openAlbumPhoto(event: any) {
    if (this.data.albumDragging || this.data.albumSaving) return;
    const photo = this.albumPhoto(event);
    if (!photo || store.getState().couple.status !== "PAIRED"
      || (appService.isRemote && (!appService.hasSession() || !store.getState().loggedIn || this.albumScope !== this.currentAlbumScope()))) return;
    if (photo.momentId) wx.navigateTo({ url: `/pkg-moment/detail/index?id=${encodeURIComponent(photo.momentId)}` });
    else if (photo.error) return this.retryAlbumPhoto();
    else return this.previewAlbum(photo.original);
  },
  async retryAlbumPhoto() {
    if (this.data.albumRetrying || !this.albumVisible) return;
    const requestId = this.requestId, scope = this.currentAlbumScope();
    const current = () => this.albumVisible && requestId === this.requestId && scope === this.currentAlbumScope();
    this.setData({ albumRetrying: true, error: "" });
    try {
      const photos = await appService.albumPhotos();
      if (!current()) return;
      if (appService.isRemote && (!appService.hasSession() || !store.getState().loggedIn)) { redirectExpiredSession(); return; }
      this.remotePhotos = photos; this.albumScope = scope; this.render(); this.scheduleAlbumRefresh();
    } catch (error) {
      if (!redirectExpiredSession() && current()) this.setData({ error: userError(error, "照片地址没有刷新成功，请稍后重试。") });
    } finally { if (current()) this.setData({ albumRetrying: false }); }
  },
  async previewAlbum(current?: string) {
    const state = store.getState();
    if (state.couple.status !== "PAIRED" || !state.loggedIn || (appService.isRemote && !appService.hasSession()) || this.albumScope !== this.currentAlbumScope()) return;
    const scope = this.currentAlbumScope(), requestId = this.requestId;
    const available = () => albumPhotos(appService.isRemote ? this.remoteAlbum : state.moments, state.couple.status, this.remotePhotos, store.getState().couple.albumOrder);
    if (appService.isRemote && available().some(photo => /[?&]q-key-time=/.test(photo.original) && !mediaCache.isUrlCurrent(photo.original))) {
      const selected = available().find(photo => photo.original === current)?.assetId;
      try {
        const [moments, photos] = await Promise.all([appService.album(), appService.albumPhotos()]);
        if (!this.albumVisible || requestId !== this.requestId || scope !== this.currentAlbumScope() || !appService.hasSession()) return;
        this.remoteAlbum = moments; this.remotePhotos = photos; this.render();
        if (selected) {
          const photo = available().find(value => value.assetId === selected);
          if (!photo) throw new Error("照片不存在或当前不可访问。");
          current = photo.original;
        }
      } catch (error) {
        if (requestId === this.requestId && scope === this.currentAlbumScope() && !redirectExpiredSession()) this.setData({ error: userError(error, "照片地址没有刷新成功，请重试。") });
        return;
      }
    }
    const urls = available().map(photo => photo.original).filter(Boolean);
    if (urls.length) wx.previewImage({ current: current || urls[0], urls: [...new Set(urls)] });
  },
  viewAlbum() { return this.previewAlbum(); },
  toggleAlbumManage() {
    if (this.data.albumDeleting || this.data.albumSaving || this.data.albumDragging) return;
    this.setData({ albumManaging: !this.data.albumManaging }); this.render();
  },
  async deleteAlbumPhoto(event: any) {
    const photo = this.albumPhoto(event), scope = this.currentAlbumScope();
    if (!photo || photo.author !== "我" || photo.momentId || this.data.albumDeleting || !this.albumVisible
      || this.albumScope !== scope || store.getState().couple.status !== "PAIRED"
      || (appService.isRemote && (!appService.hasSession() || !store.getState().loggedIn))) return;
    this.setData({ albumDeleting: photo.assetId, error: "" });
    try {
      const confirmed = await new Promise<boolean>(resolve => wx.showModal({ title: "删除这张照片？",
        content: "删除后将从你们的共同相册移除，双方都无法再查看，且无法恢复。", confirmText: "删除", confirmColor: "#A84454",
        success: (result: any) => resolve(Boolean(result.confirm)), fail: () => resolve(false) }));
      if (!confirmed || !this.albumVisible || scope !== this.currentAlbumScope()) return;
      await appService.deleteAlbumPhoto(photo.assetId);
      if (scope !== this.currentAlbumScope()) return;
      this.requestId++; clearTimeout(this.albumTimer);
      this.remotePhotos = this.remotePhotos.filter(value => value.assetId !== photo.assetId);
      for (const url of [photo.source, photo.original]) mediaCache.forget(this.data.albumOwner, photo.assetId, url);
      if (this.albumVisible) { this.render(); this.scheduleAlbumRefresh(); wx.showToast({ title: "照片已删除", icon: "none" }); }
    } catch (error) {
      if (scope === this.currentAlbumScope() && !redirectExpiredSession()) this.setData({ error: userError(error, "照片没有删除成功，请重试。") });
    } finally { if (scope === this.currentAlbumScope()) this.setData({ albumDeleting: "" }); }
  },
  async uploadAlbum() {
    if (this.data.albumUploading || this.data.albumSaving || this.data.albumDragging || store.getState().couple.status !== "PAIRED") return;
    if (this.data.albumRemaining <= 0) { wx.showToast({ title: "相册最多保留 6 张照片，请先移除照片。", icon: "none" }); return; }
    const scope = this.currentAlbumScope();
    this.setData({ albumUploading: true, error: "" });
    try {
      const selected: any = await new Promise((resolve, reject) => wx.chooseMedia({ count: this.data.albumRemaining, mediaType: ["image"], sourceType: ["album", "camera"], success: resolve, fail: reject }));
      const photos = await appService.uploadAlbumPhotos(selected.tempFiles || [], text => this.setData({ albumUploadText: text }));
      if (scope !== this.currentAlbumScope()) return;
      this.remotePhotos = photos; this.albumScope = scope; this.albumPollCount = 0; this.render();
      wx.showToast({ title: this.data.albumPending ? "照片已上传，安全处理后展示" : "已加入共同相册", icon: "none" });
      this.scheduleAlbumRefresh();
    } catch (error: any) {
      if (!String(error?.errMsg || "").includes("cancel") && !redirectExpiredSession()) {
        if (scope === this.currentAlbumScope()) {
          try {
            const photos = await appService.albumPhotos();
            if (scope !== this.currentAlbumScope()) return;
            this.remotePhotos = photos; this.albumScope = scope; this.albumPollCount = 0; this.render(); this.scheduleAlbumRefresh();
          } catch (_) {}
          this.setData({ error: userError(error, "照片没有上传完成，请重试。") });
        }
      }
    } finally { this.setData({ albumUploading: false, albumUploadText: "上传照片" }); }
  },
  scheduleAlbumRefresh() {
    clearTimeout(this.albumTimer);
    if (!this.albumVisible || this.data.albumDragging || this.data.albumSaving || !this.data.albumPending || this.albumPollCount >= 12 || !appService.isRemote) return;
    const scope = this.currentAlbumScope(), requestId = this.requestId;
    this.albumTimer = setTimeout(async () => {
      this.albumPollCount++;
      try {
        const photos = await appService.albumPhotos();
        if (!this.albumVisible || requestId !== this.requestId || scope !== this.currentAlbumScope()) return;
        this.remotePhotos = photos;
        if (!this.data.albumDragging && !this.data.albumSaving) this.render();
        this.scheduleAlbumRefresh();
      } catch (_) { this.scheduleAlbumRefresh(); }
    }, 5000);
  },
  avatarError(event: any) { this.setData({ [event.currentTarget.dataset.avatar === "my" ? "myAvatarError" : "partnerAvatarError"]: true }); },
  retry() { return this.onShow(true); },
  daysSince(value: string) { if (!value) return 0; return Math.max(1, Math.floor((Date.now() - new Date(`${value}T00:00:00+08:00`).getTime()) / 86400000)); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); },
});
