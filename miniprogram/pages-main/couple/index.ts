import { store } from "../../core/store";
import { albumPhotos } from "../../core/couple-album";
import { mediaCache } from "../../core/media-cache";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { couple: {} as any, pet: {} as any, unread: 0, sharedCount: 0, days: 0, myInitial: "我", myAvatarUrl: "", partnerInitial: "TA", partnerAvatarUrl: "", loading: false, loaded: false, error: "", isRemote: appService.isRemote, editing: false, editName: "", editAnniversary: "", savingProfile: false,
    albumColumns: [[], []] as any[][], albumCount: 0, albumOffset: 0, albumLoading: false, albumOwner: "" },
  requestId: 0,
  albumScope: "",
  remoteAlbum: [] as any[],
  async onShow() {
    const requestId = ++this.requestId;
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 1 });
    this.setData({ loading: true, error: "" });
    this.render();
    if (this.data.albumCount) this.setData({ loaded: true });
    try {
      await appService.refresh();
      if (requestId !== this.requestId) return;
      this.render();
      if (store.getState().couple.status === "PAIRED") {
        const scope = this.currentAlbumScope();
        this.setData({ albumLoading: true, loaded: true });
        const moments = await appService.album();
        if (requestId !== this.requestId || scope !== this.currentAlbumScope()) return;
        this.remoteAlbum = moments;
        this.albumScope = scope;
      }
    } catch (error) {
      if (requestId === this.requestId && !redirectExpiredSession()) this.setData({ error: userError(error, "情侣空间同步失败，当前展示最近一次保存的状态。") });
    } finally {
      if (requestId === this.requestId) {
        this.render(); this.setData({ loading: false, loaded: true, albumLoading: false });
        wx.stopPullDownRefresh();
      }
    }
  },
  onHide() { this.requestId++; },
  onUnload() { this.requestId++; },
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
    const owner = state.loggedIn && appService.hasSession() ? state.profile.id || "" : "";
    const photos = albumPhotos(source, state.couple.status).map((photo, index) => ({ ...photo,
      path: mediaCache.get(owner, photo.assetId, photo.source, photo.author === "TA") || photo.source,
      error: false, aspect: ["portrait", "landscape", "landscape", "square", "wide", "landscape"][index] }));
    this.setData({
      albumColumns: [photos.filter((_photo, index) => index % 2 === 0), photos.filter((_photo, index) => index % 2 === 1)],
      albumCount: photos.length, albumOwner: owner,
      couple: state.couple, pet: state.pet,
      unread: state.messages.filter((item) => !item.read).length,
      sharedCount: state.moments.filter((item) => item.visibility === "SHARED" && item.status !== "DELETED").length,
      days: this.daysSince(state.couple.anniversary),
      myInitial: (state.profile.name || "我").slice(0, 1),
      myAvatarUrl: state.profile.avatarUrl || "",
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1),
      partnerAvatarUrl: state.couple.partnerAvatarUrl || ""
    });
  },
  albumPhoto(event: any) {
    const { column, index } = event.currentTarget.dataset;
    return this.data.albumColumns[column]?.[index];
  },
  albumPhotoLoaded(event: any) {
    const photo = this.albumPhoto(event);
    if (!photo || photo.path !== photo.source || !appService.hasSession() || this.data.albumOwner !== store.getState().profile.id
      || this.albumScope !== this.currentAlbumScope()) return;
    void mediaCache.remember(this.data.albumOwner, photo.assetId, photo.source, photo.author === "TA");
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
    wx.navigateTo({ url: `/pkg-moment/detail/index?id=${encodeURIComponent(photo.momentId)}` });
  },
  retry() { this.onShow(); },
  daysSince(value: string) { if (!value) return 0; return Math.max(1, Math.floor((Date.now() - new Date(`${value}T00:00:00+08:00`).getTime()) / 86400000)); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); },
  pet() { wx.navigateTo({ url: "/pkg-pet/detail/index" }); },
  settings() { wx.switchTab({ url: "/pages-main/mine/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); },
  openProfileEditor() {
    const couple = store.getState().couple;
    this.setData({ editing: true, editName: couple.relationshipName || "我们的空间", editAnniversary: couple.anniversary || "" });
  },
  closeProfileEditor() { if (!this.data.savingProfile) this.setData({ editing: false }); },
  nameInput(event: any) { this.setData({ editName: event.detail.value }); },
  anniversaryChange(event: any) { this.setData({ editAnniversary: event.detail.value }); },
  clearAnniversary() { this.setData({ editAnniversary: "" }); },
  async saveProfile() {
    if (this.data.savingProfile) return;
    const name = String(this.data.editName || "").trim();
    if (!name) { wx.showToast({ title: "请填写你们的关系昵称", icon: "none" }); return; }
    this.setData({ savingProfile: true });
    try {
      await appService.updateCoupleProfile(name, this.data.editAnniversary || null);
      this.render(); this.setData({ editing: false });
    } catch (error: any) {
      if (error?.code === "VERSION_CONFLICT") { await appService.refresh(); this.render(); }
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "保存失败，请稍后重试。"), icon: "none" });
    } finally { this.setData({ savingProfile: false }); }
  }
});
