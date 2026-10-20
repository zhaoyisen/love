import { store } from "../../core/store";
import { mediaCache } from "../../core/media-cache";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { recap: {} as any, count: 0, selectedCount: 0, coverPath: "", paired: false, loading: true, loaded: false, error: "", unread: 0 },
  syncVersion: "",
  pageScope: "",
  currentScope() { const state = store.getState(); return `${state.profile.id}:${state.couple.id}:${state.couple.status}:${state.loggedIn}`; },
  requestId: 0,
  async onShow(force = false) {
    const scope = this.currentScope();
    if (this.pageScope && this.pageScope !== scope) { this.syncVersion = ""; this.setData({ loaded: false, coverPath: "" }); this.render(); }
    this.pageScope = scope;
    const requestId = ++this.requestId;
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 2 });
    if (!this.data.loaded || force === true) { this.setData({ loading: appService.isRemote, error: "" }); this.render(); }
    try {
      const synced = await appService.refreshIfChanged(force === true);
      if (requestId !== this.requestId) return;
      if (this.data.error) this.setData({ error: "" });
      if (this.data.loaded && force !== true && this.syncVersion === synced.version) return;
      if (appService.isRemote) {
        if (store.getState().couple.status === "PAIRED") await appService.recap(new Date().getFullYear());
      }
      if (requestId !== this.requestId) return;
      this.render(); this.syncVersion = synced.version;
      this.pageScope = this.currentScope();
    } catch (error) {
      if (requestId === this.requestId && !redirectExpiredSession()) this.setData({ error: userError(error, "年度回顾同步失败，当前展示最近一次保存的内容。") });
    } finally {
      if (requestId === this.requestId) { this.setData({ loading: false, loaded: true }); wx.stopPullDownRefresh(); }
    }
  },
  onHide() { this.requestId++; },
  onUnload() { this.onHide(); },
  onPullDownRefresh() { return this.onShow(true); },
  render() {
    const state = store.getState();
    const sharedMoments = state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED");
    const selectedMoments = state.recap.selectedMomentIds.map((id) => sharedMoments.find((item) => item.id === id)).filter(Boolean) as any[];
    let coverPath = "";
    for (const moment of selectedMoments) {
      const media = (moment.media || []).find((item: any) => (item.type === "IMAGE" && item.path) || item.thumbnailPath);
      if (media) { coverPath = media.thumbnailPath || media.path || ""; break; }
    }
    coverPath = mediaCache.stableUrl(this.data.coverPath, coverPath);
    this.setData({ recap: state.recap, count: sharedMoments.length, selectedCount: selectedMoments.length,
      ...(coverPath !== this.data.coverPath ? { coverPath } : {}),
      paired: state.couple.status === "PAIRED", unread: state.messages.filter(item => !item.read).length });
  },
  create() { if (!this.data.paired) { wx.showToast({ title: "完成配对后可制作双人回顾", icon: "none" }); return; } wx.navigateTo({ url: "/pkg-recap/editor/index" }); },
  openCover() { if (this.data.recap.status === "READY") this.preview(); else this.create(); },
  preview() { wx.navigateTo({ url: "/pkg-recap/preview/index" }); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  compose() { wx.navigateTo({ url: "/pkg-compose/composer/index" }); }
});
