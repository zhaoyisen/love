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
  uploadedAvatarId: "",
  alive: true,
  ownerId: "" as string | undefined,

  onLoad() {
    const profile = store.getState().profile;
    const nickname = profile.name || "";
    this.alive = true;
    this.ownerId = profile.id;
    const pendingAvatar = profile.pendingAvatarId || (profile.avatarStatus === "PROCESSING" && profile.avatarAssetId);
    this.uploadedAvatarId = pendingAvatar || "";
    this.setData({
      nickname,
      displayName: nickname || "你的昵称",
      originalName: nickname,
      avatarUrl: profile.avatarUrl || "",
      originalAvatarUrl: profile.avatarUrl || "",
      initial: nickname.slice(0, 1) || "我",
      remaining: Math.max(0, 30 - nickname.length),
      avatarChanged: Boolean(pendingAvatar), canSubmit: Boolean(pendingAvatar),
      error: pendingAvatar ? "上次头像仍在安全处理中，可再次保存，无需重新上传。"
        : profile.avatarStatus === "BLOCKED" || profile.avatarStatus === "FAILED" ? "上次头像没有处理成功，请重新选择。" : ""
    });
  },
  onUnload() { this.alive = false; },

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
    if (this.data.submitting) return;
    const avatarUrl = String(event.detail?.avatarUrl || "");
    if (!avatarUrl) {
      wx.showToast({ title: "没有获取到头像，请重新选择", icon: "none" });
      return;
    }
    this.uploadedAvatarId = "";
    store.update(state => { state.profile.pendingAvatarId = undefined; });
    this.setData({ avatarUrl, avatarChanged: avatarUrl !== this.data.originalAvatarUrl, canSubmit: Boolean(this.data.nickname.trim()), error: "" });
  },

  fileInfo(filePath: string): Promise<{ size: number }> {
    return new Promise((resolve, reject) => wx.getFileInfo({ filePath, success: resolve, fail: reject }));
  },

  async uploadAvatar() {
    if (this.uploadedAvatarId) return mediaService.waitUntilReady(this.uploadedAvatarId);
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
    if (store.getState().profile.id !== this.ownerId) throw new Error("账号已变化，请重新打开资料页。");
    this.uploadedAvatarId = result.asset.id;
    store.update(state => { state.profile.pendingAvatarId = result.asset.id; });
    this.setData({ savingText: "正在安全处理头像" });
    return mediaService.waitUntilReady(result.asset.id);
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
      let avatarUrl: string | undefined;
      if (this.data.avatarChanged && appService.isRemote) {
        this.setData({ savingText: "准备上传头像" });
        const avatar = await this.uploadAvatar();
        if (!this.alive || store.getState().profile.id !== this.ownerId) return;
        avatarAssetId = avatar.id;
        avatarUrl = avatar.access_url;
      }
      this.setData({ savingText: "正在保存资料" });
      await appService.updateProfile(nickname, avatarAssetId, this.data.avatarChanged ? (appService.isRemote ? avatarUrl : this.data.avatarUrl) : undefined);
      if (store.getState().profile.id !== this.ownerId) return;
      store.update(state => { state.profile.pendingAvatarId = undefined; });
      if (!this.alive) return;
      wx.showToast({ title: "资料已保存", icon: "success" });
      setTimeout(() => { if (this.alive) wx.navigateBack(); }, 350);
    } catch (error) {
      if (this.alive && !redirectExpiredSession()) {
        this.setData({ error: userError(error, "保存失败，请检查网络后重试。") });
      }
    } finally {
      if (this.alive) this.setData({ submitting: false, savingText: "正在保存" });
    }
  },

  cancel() {
    if (!this.data.submitting) wx.navigateBack();
  }
});
