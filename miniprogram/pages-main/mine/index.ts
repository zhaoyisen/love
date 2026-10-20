import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: {
    state: {} as any, loading: false, loaded: false, error: "", unreadCount: 0,
    myInitial: "我", myAvatarUrl: "", myAvatarError: false,
    partnerInitial: "TA", partnerAvatarUrl: "", partnerAvatarError: false,
    relationshipName: "我们的空间", relationshipStatusText: "尚未配对", relationshipDescription: ""
  },
  async onShow() {
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 3 });
    this.setData({ loading: appService.isRemote, error: "" }); this.render();
    try { await appService.refresh(); }
    catch (error) { if (!redirectExpiredSession()) this.setData({ error: userError(error, "个人资料同步失败，当前展示最近一次保存的状态。") }); }
    finally { this.render(); this.setData({ loading: false, loaded: true }); }
  },
  render() {
    const state = store.getState(), paired = state.couple.status === "PAIRED", ended = state.couple.status === "ENDED";
    this.setData({
      state, unreadCount: state.messages.filter(item => !item.read).length,
      myInitial: (state.profile.name || "我").slice(0, 1), myAvatarUrl: state.profile.avatarUrl || "",
      myAvatarError: this.data.myAvatarUrl === (state.profile.avatarUrl || "") && this.data.myAvatarError,
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1), partnerAvatarUrl: state.couple.partnerAvatarUrl || "",
      partnerAvatarError: this.data.partnerAvatarUrl === (state.couple.partnerAvatarUrl || "") && this.data.partnerAvatarError,
      relationshipName: paired ? state.couple.relationshipName || "我们的空间" : ended ? "情侣空间已结束" : "暂未建立情侣空间",
      relationshipStatusText: paired ? "已配对" : ended ? "已结束" : "尚未配对",
      relationshipDescription: paired ? `和 ${state.couple.partnerName || "TA"} 的共同空间` : ended ? "双方内容已停止互访，你创建的记录仍会保留" : "先独自记录，配对后再决定哪些内容共同可见"
    });
  },
  retry() { return this.onShow(); },
  avatarError(event: any) { this.setData(event.currentTarget.dataset.avatar === "my" ? { myAvatarError: true } : { partnerAvatarError: true }); },
  edit() { wx.navigateTo({ url: "/pkg-profile/edit/index" }); },
  settings() { wx.navigateTo({ url: "/pkg-profile/settings/index" }); }
});
