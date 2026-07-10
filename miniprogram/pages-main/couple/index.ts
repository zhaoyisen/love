import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { couple: {} as any, pet: {} as any, unread: 0, sharedCount: 0, days: 0, myInitial: "我", partnerInitial: "TA", loading: false, loaded: false, error: "", isRemote: appService.isRemote },
  async onShow() {
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 1 });
    this.setData({ loading: true, error: "" });
    try { await appService.refresh(); }
    catch (error) { if (!redirectExpiredSession()) this.setData({ error: userError(error, "情侣空间同步失败，当前展示最近一次保存的状态。") }); }
    finally { this.render(); this.setData({ loading: false, loaded: true }); }
  },
  render() {
    const state = store.getState();
    this.setData({
      couple: state.couple, pet: state.pet,
      unread: state.messages.filter((item) => !item.read).length,
      sharedCount: state.moments.filter((item) => item.visibility === "SHARED" && item.status !== "DELETED").length,
      days: this.daysSince(state.couple.anniversary),
      myInitial: (state.profile.name || "我").slice(0, 1),
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1)
    });
  },
  retry() { this.onShow(); },
  daysSince(value: string) { if (!value) return 0; return Math.max(1, Math.floor((Date.now() - new Date(`${value}T00:00:00+08:00`).getTime()) / 86400000)); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); },
  pet() { wx.navigateTo({ url: "/pkg-pet/detail/index" }); },
  settings() { wx.switchTab({ url: "/pages-main/mine/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); }
});
