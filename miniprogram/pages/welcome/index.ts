import { store } from "../../core/store";
import { appService } from "../../services/app-service";

Page({
  data: {
    agreed: false,
    loading: false,
    error: "",
    statusBarHeight: 0,
    navigationHeight: 44,
    menuInset: 16
  },
  onLoad() {
    const windowInfo = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const statusBarHeight = Number(windowInfo.statusBarHeight || 0);
    const menu = wx.getMenuButtonBoundingClientRect ? wx.getMenuButtonBoundingClientRect() : null;
    const navigationHeight = menu && menu.bottom
      ? menu.bottom + Math.max(menu.top - statusBarHeight, 0)
      : statusBarHeight + 44;
    const menuInset = menu && windowInfo.windowWidth
      ? Math.max(windowInfo.windowWidth - menu.left + 8, 16)
      : 16;
    this.setData({ statusBarHeight, navigationHeight, menuInset });
    if (store.getState().loggedIn && (!appService.isRemote || appService.hasSession())) wx.switchTab({ url: "/pages-main/time/index" });
  },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }); },
  openUserAgreement() { wx.navigateTo({ url: "/pkg-profile/agreement/index?type=terms" }); },
  openPrivacy() {
    if (wx.openPrivacyContract) {
      wx.openPrivacyContract({
        fail: () => wx.navigateTo({ url: "/pkg-profile/agreement/index?type=privacy" })
      });
      return;
    }
    wx.navigateTo({ url: "/pkg-profile/agreement/index?type=privacy" });
  },
  async login() {
    if (!this.data.agreed) { wx.showToast({ title: "请先阅读并同意协议", icon: "none" }); return; }
    if (this.data.loading) return;
    wx.setStorageSync("love-notes:consent:v1", { version: "2026-07-15", agreedAt: new Date().toISOString() });
    this.setData({ loading: true, error: "" });
    try {
      await appService.login();
      const pendingInvitation = wx.getStorageSync("love-notes:pending-invitation");
      if (pendingInvitation) wx.reLaunch({ url: `/pkg-couple/invite/index?token=${pendingInvitation}` });
      else wx.switchTab({ url: "/pages-main/time/index" });
    } catch {
      this.setData({ error: "登录没有完成，请检查网络后重试。" });
    } finally {
      this.setData({ loading: false });
    }
  },
  explore() { this.setData({ agreed: true }); }
});
