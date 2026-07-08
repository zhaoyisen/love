import { store } from "../../core/store";
import { appService, userError } from "../../services/app-service";

Page({
  data: { agreed: false, loading: false, error: "" },
  onLoad() {
    if (store.getState().loggedIn && (!appService.isRemote || appService.hasSession())) wx.switchTab({ url: "/pages-main/time/index" });
  },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }); },
  openPrivacy() { wx.showModal({ title: "隐私说明", content: "你的记录默认私密。只有主动设为共同可见且情侣关系有效时，另一半才能查看。解绑后立即停止互访。", showCancel: false }); },
  async login() {
    if (!this.data.agreed) { wx.showToast({ title: "请先阅读并同意协议", icon: "none" }); return; }
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      await appService.login();
      const pendingInvitation = wx.getStorageSync("love-notes:pending-invitation");
      if (pendingInvitation) wx.reLaunch({ url: `/pkg-couple/invite/index?token=${pendingInvitation}` });
      else wx.switchTab({ url: "/pages-main/time/index" });
    } catch (error) {
      this.setData({ error: userError(error, "登录没有完成，请检查网络后重试。") });
    } finally {
      this.setData({ loading: false });
    }
  },
  explore() { this.setData({ agreed: true }); }
});
