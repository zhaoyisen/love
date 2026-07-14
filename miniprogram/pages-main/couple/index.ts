import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { couple: {} as any, pet: {} as any, unread: 0, sharedCount: 0, days: 0, myInitial: "我", myAvatarUrl: "", partnerInitial: "TA", loading: false, loaded: false, error: "", isRemote: appService.isRemote, editing: false, editName: "", editAnniversary: "", savingProfile: false },
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
      myAvatarUrl: state.profile.avatarUrl || "",
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1)
    });
  },
  retry() { this.onShow(); },
  daysSince(value: string) { if (!value) return 0; return Math.max(1, Math.floor((Date.now() - new Date(`${value}T00:00:00+08:00`).getTime()) / 86400000)); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); },
  pet() { wx.navigateTo({ url: "/pkg-pet/detail/index" }); },
  settings() { wx.switchTab({ url: "/pages-main/mine/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); },
  openProfileEditor() {
    const couple = store.getState().couple;
    this.setData({ editing: true, editName: couple.relationshipName || "我们的空间", editAnniversary: couple.anniversary || "" });
  },
  closeProfileEditor() { if (!this.data.savingProfile) this.setData({ editing: false }); },
  nameInput(event: any) { this.setData({ editName: event.detail.value }); },
  anniversaryChange(event: any) { this.setData({ editAnniversary: event.detail.value }); },
  clearAnniversary() { this.setData({ editAnniversary: "" }); },
  async saveProfile() {
    if (this.data.savingProfile) return;
    const name = String(this.data.editName || "").trim();
    if (!name) { wx.showToast({ title: "请填写你们的关系昵称", icon: "none" }); return; }
    this.setData({ savingProfile: true });
    try {
      await appService.updateCoupleProfile(name, this.data.editAnniversary || null);
      this.render(); this.setData({ editing: false });
      wx.showToast({ title: "关系资料已保存", icon: "success" });
    } catch (error: any) {
      if (error?.code === "VERSION_CONFLICT") { await appService.refresh(); this.render(); }
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "保存失败，请稍后重试。"), icon: "none" });
    } finally { this.setData({ savingProfile: false }); }
  }
});
