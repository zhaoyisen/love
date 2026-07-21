import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { defaultVisibility: "PRIVATE", paired: false, saving: false, error: "" },
  onShow() { const state = store.getState(); this.setData({ defaultVisibility: state.profile.defaultVisibility, paired: state.couple.status === "PAIRED" }); },
  async setVisibility(event: any) {
    const value = event.currentTarget.dataset.value as "PRIVATE" | "SHARED";
    if (this.data.saving || value === this.data.defaultVisibility) return;
    if (value === "SHARED" && !this.data.paired) { wx.showToast({ title: "配对后才可设为默认", icon: "none" }); return; }
    const previous = this.data.defaultVisibility;
    this.setData({ defaultVisibility: value, saving: true, error: "" });
    try {
      const saved = await appService.updateDefaultVisibility(value);
      this.setData({ defaultVisibility: saved });
      wx.showToast({ title: "默认范围已同步", icon: "success" });
    } catch (error) {
      this.setData({ defaultVisibility: previous, error: userError(error, "默认范围保存失败，请重试。") });
      if (!redirectExpiredSession()) wx.showToast({ title: "保存失败，已恢复原设置", icon: "none" });
    } finally { this.setData({ saving: false }); }
  },
  unbind() { wx.navigateTo({ url: "/pkg-couple/unbind/index" }); }
});
