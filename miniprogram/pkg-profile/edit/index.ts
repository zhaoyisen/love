import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: {
    nickname: "",
    displayName: "你的昵称",
    originalName: "",
    initial: "我",
    remaining: 30,
    canSubmit: false,
    submitting: false,
    error: "",
    isRemote: appService.isRemote
  },

  onLoad() {
    const nickname = store.getState().profile.name || "";
    this.setData({
      nickname,
      displayName: nickname || "你的昵称",
      originalName: nickname,
      initial: nickname.slice(0, 1) || "我",
      remaining: Math.max(0, 30 - nickname.length)
    });
  },

  inputNickname(event: any) {
    const nickname = String(event.detail.value || "");
    const normalized = nickname.trim();
    this.setData({
      nickname,
      displayName: normalized || "你的昵称",
      initial: normalized.slice(0, 1) || "我",
      remaining: Math.max(0, 30 - nickname.length),
      canSubmit: normalized.length > 0 && normalized.length <= 30 && normalized !== this.data.originalName,
      error: ""
    });
  },

  async save() {
    if (this.data.submitting) return;
    const nickname = this.data.nickname.trim();
    if (!nickname) {
      this.setData({ error: "请输入昵称。", canSubmit: false });
      return;
    }
    if (nickname.length > 30) {
      this.setData({ error: "昵称最多 30 个字符。", canSubmit: false });
      return;
    }
    if (nickname === this.data.originalName) {
      wx.navigateBack();
      return;
    }

    this.setData({ submitting: true, error: "" });
    try {
      await appService.updateProfile(nickname);
      wx.showToast({ title: "资料已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 350);
    } catch (error) {
      if (!redirectExpiredSession()) {
        this.setData({ error: userError(error, "保存失败，请检查网络后重试。") });
      }
    } finally {
      this.setData({ submitting: false });
    }
  },

  cancel() {
    if (!this.data.submitting) wx.navigateBack();
  }
});
