import { API_CONFIG } from "../../core/api-config";
import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: {
    state: {} as any,
    isRemote: appService.isRemote,
    modeText: appService.isRemote ? "已连接真实服务" : "本地演示模式",
    clientVersion: API_CONFIG.clientVersion,
    loading: false,
    loaded: false,
    myInitial: "我",
    partnerInitial: "TA",
    partnerAvatarUrl: "",
    relationshipName: "我们的空间",
    relationshipStatusText: "尚未配对",
    relationshipDescription: "先独自记录，配对后再决定哪些内容共同可见",
    unreadCount: 0,
    error: ""
  },

  async onShow() {
    const tab = this.getTabBar && this.getTabBar();
    if (tab) tab.setData({ selected: 3 });
    this.setData({ loading: appService.isRemote, error: "" });
    try {
      await appService.refresh();
    } catch (error) {
      if (!redirectExpiredSession()) {
        this.setData({ error: userError(error, "个人资料同步失败，当前展示最近一次保存的状态。") });
      }
    } finally {
      this.render();
      this.setData({ loading: false, loaded: true });
    }
  },

  render() {
    const state = store.getState();
    const paired = state.couple.status === "PAIRED";
    const ended = state.couple.status === "ENDED";
    this.setData({
      state,
      myInitial: (state.profile.name || "我").slice(0, 1),
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1),
      partnerAvatarUrl: state.couple.partnerAvatarUrl || "",
      relationshipName: paired ? (state.couple.relationshipName || "我们的空间") : ended ? "情侣空间已结束" : "暂未建立情侣空间",
      relationshipStatusText: paired ? "已配对" : ended ? "已结束" : "尚未配对",
      relationshipDescription: paired
        ? `和 ${state.couple.partnerName || "TA"} 的共同空间`
        : ended
          ? "双方内容已停止互访，你创建的记录仍会保留"
          : "先独自记录，配对后再决定哪些内容共同可见",
      unreadCount: state.messages.filter((item) => !item.read).length
    });
  },
  retry() { this.onShow(); },
  edit() { wx.navigateTo({ url: "/pkg-profile/edit/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); },
  recycle() { wx.navigateTo({ url: "/pkg-moment/recycle-bin/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); },
  deleteAccount() { wx.navigateTo({ url: "/pkg-profile/delete-account/index" }); },
  recap() { if (!appService.isRemote) wx.switchTab({ url: "/pages-main/recap/index" }); },

  async toggle(event: any) {
    const key = event.currentTarget.dataset.key as keyof ReturnType<typeof store.getState>["preferences"];
    const value = Boolean(event.detail.value);
    const previous = store.getState().preferences[key];
    store.updatePreference(key, value);
    this.render();
    try {
      await appService.updateNotificationPreference(key, value);
      this.render();
    } catch (error) {
      store.updatePreference(key, previous);
      this.render();
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "提醒偏好保存失败，请稍后重试。"), icon: "none" });
    }
  },

  reset() {
    if (appService.isRemote) return;
    wx.showModal({
      title: "重置演示数据？",
      content: "这会清除当前设备上的演示操作并回到首次进入状态。",
      confirmText: "重置",
      confirmColor: "#8F3F3F",
      success: (result: any) => {
        if (!result.confirm) return;
        store.reset();
        wx.reLaunch({ url: "/pages/welcome/index" });
      }
    });
  },

  about() {
    wx.showModal({
      title: "恋爱笔记",
      content: `客户端 ${API_CONFIG.clientVersion}\n默认私密，主动分享。普通的日子也值得被认真保存。`,
      showCancel: false
    });
  }
});
