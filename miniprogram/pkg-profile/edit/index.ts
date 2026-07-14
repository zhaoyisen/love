import { store } from "../../core/store";
import type { MediaItem } from "../../core/types";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
import { mediaService } from "../../services/media-service";

Page({
  data: {
    nickname: "",
    displayName: "你的昵称",
    originalName: "",
    avatarUrl: "",
    originalAvatarUrl: "",
    avatarChanged: false,
    initial: "我",
    remaining: 30,
    canSubmit: false,
    submitting: false,
    savingText: "正在保存",
    error: "",
    isRemote: appService.isRemote
  },

  onLoad() {
    const profile = store.getState().profile;
    const nickname = profile.name || "";
    this.setData({
      nickname,
      displayName: nickname || "你的昵称",
      originalName: nickname,
      avatarUrl: profile.avatarUrl || "",
      originalAvatarUrl: profile.avatarUrl || "",
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
      canSubmit: normalized.length > 0 && normalized.length <= 30 && (normalized !== this.data.originalName || this.data.avatarChanged),
      error: ""
    });
  },

  chooseWechatAvatar(event: any) {
    const avatarUrl = String(event.detail?.avatarUrl || "");
    if (!avatarUrl) {
      wx.showToast({ title: "没有获取到头像，请重新选择", icon: "none" });
      return;
    }
    this.setData({ avatarUrl, avatarChanged: avatarUrl !== this.data.originalAvatarUrl, canSubmit: Boolean(this.data.nickname.trim()), error: "" });
  },

  fileInfo(filePath: string): Promise<{ size: number }> {
    return new Promise((resolve, reject) => wx.getFileInfo({ filePath, success: resolve, fail: reject }));
  },

  async uploadAvatar(): Promise<string> {
    const filePath = this.data.avatarUrl;
    const info = await this.fileInfo(filePath);
    const cleanPath = filePath.split("?")[0];
    const rawName = cleanPath.split("/").pop() || `avatar_${Date.now()}.jpg`;
    const lowerName = rawName.toLowerCase();
    const mimeType = lowerName.endsWith(".png") ? "image/png" : lowerName.endsWith(".webp") ? "image/webp" : "image/jpeg";
    const fileName = /\.(jpe?g|png|webp)$/i.test(rawName) ? rawName : `${rawName}.jpg`;
    const file: MediaItem = {
      id: `avatar_${Date.now()}`,
      type: "IMAGE",
      path: filePath,
      fileName,
      mimeType,
      size: Number(info.size || 0),
      progress: 0,
      status: "UPLOADING"
    };
    const result = await mediaService.upload(file, (progress) => this.setData({ savingText: `上传头像 ${progress}%` }));
    return result.asset.id;
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
    if (nickname === this.data.originalName && !this.data.avatarChanged) {
      wx.navigateBack();
      return;
    }

    this.setData({ submitting: true, error: "" });
    try {
      let avatarAssetId: string | undefined;
      if (this.data.avatarChanged && appService.isRemote) {
        this.setData({ savingText: "准备上传头像" });
        avatarAssetId = await this.uploadAvatar();
      }
      this.setData({ savingText: "正在保存资料" });
      await appService.updateProfile(nickname, avatarAssetId, this.data.avatarChanged ? this.data.avatarUrl : undefined);
      wx.showToast({ title: "资料已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 350);
    } catch (error) {
      if (!redirectExpiredSession()) {
        this.setData({ error: userError(error, "保存失败，请检查网络后重试。") });
      }
    } finally {
      this.setData({ submitting: false, savingText: "正在保存" });
    }
  },

  cancel() {
    if (!this.data.submitting) wx.navigateBack();
  }
});
