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
    error: ""
  },

  async onShow() {
    const tab = this.getTabBar && this.getTabBar();
    if (tab) tab.setData({ selected: -1 });
    this.setData({ loading: appService.isRemote, error: "" });
    try {
      await appService.refresh();
    } catch (error) {
      if (!redirectExpiredSession()) {
        this.setData({ error: userError(error, "个人资料同步失败，当前展示最近一次保存的状态。") });
      }
    } finally {
      this.render();
      this.setData({ loading: false });
    }
  },

  render() { this.setData({ state: store.getState() }); },
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
