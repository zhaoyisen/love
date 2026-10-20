import { API_CONFIG } from "../../core/api-config";
import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: {
    state: {} as any, isRemote: appService.isRemote, clientVersion: API_CONFIG.clientVersion,
    modeText: appService.isRemote ? "已连接真实服务" : "本地演示模式",
    loading: false, loaded: false, error: "", noticesOpen: false, noticeCount: 0, savingPreference: false,
    editing: false, editName: "", editAnniversary: "", savingProfile: false
  },
  editingCoupleId: "",
  async onShow() {
    this.setData({ loading: appService.isRemote, error: "" }); this.render();
    try { await appService.refresh(); }
    catch (error) { if (!redirectExpiredSession()) this.setData({ error: userError(error, "个人资料同步失败，当前展示最近一次保存的状态。") }); }
    finally { this.render(); this.setData({ loading: false, loaded: true }); }
  },
  render() {
    const state = store.getState();
    this.setData({ state, noticeCount: [state.preferences.momentNotice, state.preferences.reactionNotice, state.preferences.petNotice, state.preferences.recapNotice].filter(Boolean).length });
  },
  retry() { return this.onShow(); },
  toggleNotices() { this.setData({ noticesOpen: !this.data.noticesOpen }); },
  async toggle(event: any) {
    if (this.data.loading || this.data.savingPreference) return;
    const key = event.currentTarget.dataset.key as keyof ReturnType<typeof store.getState>["preferences"];
    if (!["momentNotice", "reactionNotice", "petNotice", "recapNotice"].includes(key)) return;
    const value = Boolean(event.detail.value), previous = store.getState().preferences[key];
    this.setData({ savingPreference: true }); store.updatePreference(key, value); this.render();
    try { await appService.updateNotificationPreference(key, value); this.render(); }
    catch (error) { store.updatePreference(key, previous); this.render(); if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "提醒偏好保存失败，请稍后重试。"), icon: "none" }); }
    finally { this.setData({ savingPreference: false }); }
  },
  openProfileEditor() {
    const couple = store.getState().couple;
    if (couple.status !== "PAIRED") return;
    this.editingCoupleId = couple.id || "local";
    this.setData({ editing: true, editName: couple.relationshipName || "我们的空间", editAnniversary: couple.anniversary || "" });
  },
  closeProfileEditor() { if (!this.data.savingProfile) this.setData({ editing: false }); },
  nameInput(event: any) { this.setData({ editName: event.detail.value }); },
  anniversaryChange(event: any) { this.setData({ editAnniversary: event.detail.value }); },
  clearAnniversary() { if (!this.data.savingProfile) this.setData({ editAnniversary: "" }); },
  async saveProfile() {
    if (this.data.savingProfile) return;
    const couple = store.getState().couple;
    if (couple.status !== "PAIRED" || (couple.id || "local") !== this.editingCoupleId) { this.setData({ editing: false }); wx.showToast({ title: "情侣空间已变化，请重新打开关系资料", icon: "none" }); return; }
    const name = String(this.data.editName || "").trim();
    if (!name) { wx.showToast({ title: "请填写你们的关系昵称", icon: "none" }); return; }
    this.setData({ savingProfile: true });
    try { await appService.updateCoupleProfile(name, this.data.editAnniversary || null); this.render(); this.setData({ editing: false }); }
    catch (error: any) {
      if (error?.code === "VERSION_CONFLICT") { try { await appService.refresh(); this.render(); } catch (_) {} }
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "保存失败，请稍后重试。"), icon: "none" });
    } finally { this.setData({ savingProfile: false }); }
  },
  edit() { wx.navigateTo({ url: "/pkg-profile/edit/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); },
  recycle() { wx.navigateTo({ url: "/pkg-moment/recycle-bin/index" }); },
  deleteAccount() { wx.navigateTo({ url: "/pkg-profile/delete-account/index" }); },
  recap() { if (!appService.isRemote) wx.switchTab({ url: "/pages-main/recap/index" }); },
  help() { wx.showModal({ title: "身份、关系与设置", content: "这里保管你的资料、分享边界和提醒。\n\n身份与关系\n先确认是谁，再管理共同空间\n\n隐私与记录\n管理分享边界和已删除内容", showCancel: false }); },
  about() { wx.showModal({ title: "恋爱笔记", content: `客户端 ${API_CONFIG.clientVersion}\n默认私密，主动分享。普通的日子也值得被认真保存。`, showCancel: false }); },
  reset() {
    if (appService.isRemote) return;
    wx.showModal({ title: "重置演示数据？", content: "这会清除当前设备上的演示操作并回到首次进入状态。", confirmText: "重置", confirmColor: "#8F3F3F", success: (result: any) => { if (result.confirm) { store.reset(); wx.reLaunch({ url: "/pages/welcome/index" }); } } });
  }
});
