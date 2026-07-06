import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { stage: "create", loading: false, hours: 23, minutes: 59, token: "", inviterName: "", inviterInitial: "邀", relationshipName: "我们的空间", error: "", isRemote: appService.isRemote },
  async onLoad(query: any) {
    if (store.getState().couple.status === "PAIRED") { this.setData({ stage: "done", relationshipName: store.getState().couple.relationshipName }); return; }
    const token = query.token || wx.getStorageSync("love-notes:pending-invitation");
    if (!token) return;
    wx.setStorageSync("love-notes:pending-invitation", token);
    this.setData({ token, stage: "confirm", loading: true, error: "" });
    try {
      const preview = await appService.previewInvitation(token);
      const inviterName = preview.inviter_nickname || "TA";
      this.setData({ inviterName, inviterInitial: inviterName.slice(0, 1) });
    } catch (error) {
      this.setData({ stage: "create", error: userError(error, "邀请无法打开，请让对方重新生成。") });
    } finally {
      this.setData({ loading: false });
    }
  },
  async create() {
    if (this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      const invitation = await appService.createInvitation();
      const remaining = Math.max(0, new Date(invitation.expires_at).getTime() - Date.now());
      this.setData({ token: invitation.token, stage: "waiting", hours: Math.floor(remaining / 3600000), minutes: Math.floor((remaining % 3600000) / 60000) });
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "邀请生成失败，请稍后重试。") });
    } finally {
      this.setData({ loading: false });
    }
  },
  simulateAccept() { if (!this.data.isRemote) this.setData({ inviterName: "小满", inviterInitial: "满", stage: "confirm" }); },
  async confirm() {
    if (this.data.loading) return;
    if (this.data.isRemote && !store.getState().loggedIn) {
      wx.setStorageSync("love-notes:pending-invitation", this.data.token);
      wx.showModal({ title: "先登录再接受邀请", content: "登录后会继续回到这份邀请，历史记录不会自动共享。", showCancel: false, success: () => wx.reLaunch({ url: "/pages/welcome/index" }) });
      return;
    }
    this.setData({ loading: true, error: "" });
    try {
      await appService.acceptInvitation(this.data.token || "demo_invite");
      wx.removeStorageSync("love-notes:pending-invitation");
      this.setData({ stage: "done", relationshipName: store.getState().couple.relationshipName });
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "接受邀请失败，请确认邀请仍然有效。") });
    } finally {
      this.setData({ loading: false });
    }
  },
  home() { wx.switchTab({ url: "/pages-main/couple/index" }); },
  onShareAppMessage() { return { title: "我想和你一起记录普通日子", path: `/pkg-couple/invite/index?token=${encodeURIComponent(this.data.token || "demo_invite")}` }; }
});
