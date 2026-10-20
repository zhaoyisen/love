import { store } from "../../core/store";
import { mediaCache } from "../../core/media-cache";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: {
    state: {} as any, loading: false, loaded: false, error: "", unreadCount: 0,
    myInitial: "我", myAvatarUrl: "", myAvatarError: false,
    partnerInitial: "TA", partnerAvatarUrl: "", partnerAvatarError: false,
    relationshipName: "我们的空间", relationshipStatusText: "尚未配对", relationshipDescription: ""
  },
  syncVersion: "",
  pageScope: "",
  currentScope() { const state = store.getState(); return `${state.profile.id}:${state.couple.id}:${state.couple.status}:${state.loggedIn}`; },
  requestId: 0,
  async onShow(force = false) {
    const scope = this.currentScope();
    if (this.pageScope && this.pageScope !== scope) { this.syncVersion = ""; this.setData({ loaded: false }); this.render(); }
    this.pageScope = scope;
    const requestId = ++this.requestId;
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 3 });
    if (!this.data.loaded || force === true) { this.setData({ loading: appService.isRemote, error: "" }); this.render(); }
    try {
      const synced = await appService.refreshIfChanged(force === true);
      if (requestId !== this.requestId) return;
      if (this.data.error) this.setData({ error: "" });
      if (force === true || !this.data.loaded || this.syncVersion !== synced.version) { this.render(); this.syncVersion = synced.version; }
      this.pageScope = this.currentScope();
    }
    catch (error) { if (requestId === this.requestId && !redirectExpiredSession()) this.setData({ error: userError(error, "个人资料同步失败，当前展示最近一次保存的状态。") }); }
    finally { if (requestId === this.requestId) { this.setData({ loading: false, loaded: true }); wx.stopPullDownRefresh(); } }
  },
  onHide() { this.requestId++; },
  onUnload() { this.onHide(); },
  onPullDownRefresh() { return this.onShow(true); },
  render() {
    const state = store.getState(), paired = state.couple.status === "PAIRED", ended = state.couple.status === "ENDED";
    const myAvatarUrl = mediaCache.stableUrl(this.data.myAvatarUrl, state.profile.avatarUrl, this.data.myAvatarError);
    const partnerAvatarUrl = mediaCache.stableUrl(this.data.partnerAvatarUrl, state.couple.partnerAvatarUrl, this.data.partnerAvatarError);
    this.setData({
      state, unreadCount: state.messages.filter(item => !item.read).length,
      myInitial: (state.profile.name || "我").slice(0, 1),
      ...(myAvatarUrl !== this.data.myAvatarUrl ? { myAvatarUrl } : {}),
      myAvatarError: this.data.myAvatarUrl === myAvatarUrl && this.data.myAvatarError,
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1),
      ...(partnerAvatarUrl !== this.data.partnerAvatarUrl ? { partnerAvatarUrl } : {}),
      partnerAvatarError: this.data.partnerAvatarUrl === partnerAvatarUrl && this.data.partnerAvatarError,
      relationshipName: paired ? state.couple.relationshipName || "我们的空间" : ended ? "情侣空间已结束" : "暂未建立情侣空间",
      relationshipStatusText: paired ? "已配对" : ended ? "已结束" : "尚未配对",
      relationshipDescription: paired ? `和 ${state.couple.partnerName || "TA"} 的共同空间` : ended ? "双方内容已停止互访，你创建的记录仍会保留" : "先独自记录，配对后再决定哪些内容共同可见"
    });
  },
  retry() { return this.onShow(true); },
  avatarError(event: any) { this.setData(event.currentTarget.dataset.avatar === "my" ? { myAvatarError: true } : { partnerAvatarError: true }); },
  edit() { wx.navigateTo({ url: "/pkg-profile/edit/index" }); },
  settings() { wx.navigateTo({ url: "/pkg-profile/settings/index" }); }
});
