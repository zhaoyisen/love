import { store } from "../../core/store";
import { albumPhotos } from "../../core/couple-album";
import { mediaCache } from "../../core/media-cache";
import type { AlbumPhoto } from "../../core/types";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { couple: {} as any, unread: 0, days: 0, myInitial: "我", myAvatarUrl: "", partnerInitial: "TA", partnerAvatarUrl: "", loading: false, loaded: false, error: "", isRemote: appService.isRemote,
    albumColumns: [[], []] as any[][], albumCount: 0, albumOffset: 0, albumLoading: false, albumOwner: "",
    albumUploading: false, albumUploadText: "上传照片", albumPending: 0, albumFailed: 0, albumRetrying: false, myAvatarError: false, partnerAvatarError: false },
  requestId: 0,
  albumScope: "",
  remoteAlbum: [] as any[],
  remotePhotos: [] as AlbumPhoto[],
  albumTimer: null as any,
  albumPollCount: 0,
  albumVisible: false,
  async onShow() {
    this.albumVisible = true;
    this.albumPollCount = 0;
    clearTimeout(this.albumTimer);
    const requestId = ++this.requestId;
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 1 });
    this.setData({ loading: true, error: "", albumRetrying: false });
    this.render();
    if (this.data.albumCount) this.setData({ loaded: true });
    try {
      await appService.refresh();
      if (requestId !== this.requestId) return;
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
    } catch (error) {
      if (requestId === this.requestId && !redirectExpiredSession()) this.setData({ error: userError(error, "情侣空间同步失败，当前展示最近一次保存的状态。") });
    } finally {
      if (requestId === this.requestId) {
        this.render(); this.setData({ loading: false, loaded: true, albumLoading: false });
        wx.stopPullDownRefresh();
        this.scheduleAlbumRefresh();
      }
    }
  },
  onHide() { this.requestId++; this.albumVisible = false; clearTimeout(this.albumTimer); },
  onUnload() { this.onHide(); },
  onPullDownRefresh() { void this.onShow(); },
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
    const source = appService.isRemote ? this.albumScope === this.currentAlbumScope() && state.loggedIn && appService.hasSession() ? this.remoteAlbum : [] : state.moments;
    const authenticated = state.loggedIn && (!appService.isRemote || appService.hasSession());
    const owner = authenticated ? state.profile.id || "" : "";
    const uploads = this.albumScope === this.currentAlbumScope() ? this.remotePhotos
      : state.album?.coupleId === (state.couple.id || "local") ? state.album.photos : [];
    const allowedUploads = authenticated ? uploads : [];
    const photos = albumPhotos(source, state.couple.status, allowedUploads).map((photo, index) => ({ ...photo,
      path: mediaCache.get(owner, photo.assetId, photo.source, photo.author === "TA") || photo.source,
      error: false, aspect: ["portrait", "landscape", "landscape", "square", "wide", "landscape"][index] }));
    this.setData({
      albumColumns: [photos.filter((_photo, index) => index % 2 === 0), photos.filter((_photo, index) => index % 2 === 1)],
      albumCount: photos.length, albumOwner: owner,
      albumPending: state.couple.status === "PAIRED" ? allowedUploads.filter(photo => photo.status === "PROCESSING").length : 0,
      albumFailed: state.couple.status === "PAIRED" ? allowedUploads.filter(photo => photo.status === "FAILED" || photo.status === "BLOCKED").length : 0,
      couple: state.couple,
      unread: state.messages.filter((item) => !item.read).length,
      days: this.daysSince(state.couple.anniversary),
      myInitial: (state.profile.name || "我").slice(0, 1),
      myAvatarError: this.data.myAvatarUrl === (state.profile.avatarUrl || "") && this.data.myAvatarError,
      myAvatarUrl: state.profile.avatarUrl || "",
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1),
      partnerAvatarError: this.data.partnerAvatarUrl === (state.couple.partnerAvatarUrl || "") && this.data.partnerAvatarError,
      partnerAvatarUrl: state.couple.partnerAvatarUrl || ""
    });
  },
  albumPhoto(event: any) {
    const { column, index } = event.currentTarget.dataset;
    return this.data.albumColumns[column]?.[index];
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
    const photo = this.albumPhoto(event);
    if (!photo || store.getState().couple.status !== "PAIRED"
      || (appService.isRemote && (!appService.hasSession() || !store.getState().loggedIn || this.albumScope !== this.currentAlbumScope()))) return;
    if (photo.momentId) wx.navigateTo({ url: `/pkg-moment/detail/index?id=${encodeURIComponent(photo.momentId)}` });
    else if (photo.error) return this.retryAlbumPhoto();
    else this.previewAlbum(photo.original);
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
  previewAlbum(current?: string) {
    const state = store.getState();
    if (state.couple.status !== "PAIRED" || !state.loggedIn || (appService.isRemote && !appService.hasSession()) || this.albumScope !== this.currentAlbumScope()) return;
    const urls = [...this.remotePhotos.filter(photo => photo.status === "READY" || !photo.status).map(photo => photo.original),
      ...albumPhotos(this.remoteAlbum, state.couple.status).map(photo => photo.original)].filter(Boolean);
    if (urls.length) wx.previewImage({ current: current || urls[0], urls: [...new Set(urls)] });
  },
  viewAlbum() { this.previewAlbum(); },
  async uploadAlbum() {
    if (this.data.albumUploading || store.getState().couple.status !== "PAIRED") return;
    const scope = this.currentAlbumScope();
    this.setData({ albumUploading: true, error: "" });
    try {
      const selected: any = await new Promise((resolve, reject) => wx.chooseMedia({ count: 9, mediaType: ["image"], sourceType: ["album", "camera"], success: resolve, fail: reject }));
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
    if (!this.albumVisible || !this.data.albumPending || this.albumPollCount >= 12 || !appService.isRemote) return;
    const scope = this.currentAlbumScope();
    this.albumTimer = setTimeout(async () => {
      this.albumPollCount++;
      try {
        const photos = await appService.albumPhotos();
        if (!this.albumVisible || scope !== this.currentAlbumScope()) return;
        this.remotePhotos = photos; this.render(); this.scheduleAlbumRefresh();
      } catch (_) { this.scheduleAlbumRefresh(); }
    }, 5000);
  },
  avatarError(event: any) { this.setData({ [event.currentTarget.dataset.avatar === "my" ? "myAvatarError" : "partnerAvatarError"]: true }); },
  retry() { this.onShow(); },
  daysSince(value: string) { if (!value) return 0; return Math.max(1, Math.floor((Date.now() - new Date(`${value}T00:00:00+08:00`).getTime()) / 86400000)); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); },
});
