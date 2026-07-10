import { appService, redirectExpiredSession, userError } from "../../services/app-service";

const STATUS_KEY = "love-notes:deletion-status";

Page({
  data: {
    phrase: "",
    reason: "",
    canSubmit: false,
    submitting: false,
    refreshing: false,
    error: "",
    request: null as any,
    statusToken: "",
    isRemote: appService.isRemote
  },

  async onLoad(query: any) {
    if (query.id && query.token) {
      this.setData({ statusToken: query.token });
      await this.refreshStatus(query.id, query.token);
      return;
    }
    const cached = wx.getStorageSync(STATUS_KEY);
    if (cached && cached.id && cached.token) {
      this.setData({ statusToken: cached.token });
      await this.refreshStatus(cached.id, cached.token);
    }
  },

  inputPhrase(event: any) {
    const phrase = String(event.detail.value || "");
    this.setData({ phrase, canSubmit: phrase === "确认注销", error: "" });
  },

  inputReason(event: any) {
    this.setData({ reason: String(event.detail.value || "").slice(0, 200), error: "" });
  },

  submit() {
    if (!this.data.canSubmit || this.data.submitting) return;
    wx.showModal({
      title: "确认注销账号？",
      content: "提交后会立即停止情侣空间互访、撤销本机登录，并进入账号删除处理流程。该操作不能在小程序内自行撤销。",
      confirmText: "确认注销",
      confirmColor: "#8F3F3F",
      success: async (res: any) => {
        if (!res.confirm) return;
        await this.createDeletionRequest();
      }
    });
  },

  async createDeletionRequest() {
    this.setData({ submitting: true, error: "" });
    try {
      const result = await appService.requestAccountDeletion(this.data.phrase, this.data.reason);
      const request = result.request;
      const statusToken = result.status_token || result.statusToken || "";
      if (request && statusToken) wx.setStorageSync(STATUS_KEY, { id: request.id, token: statusToken });
      this.setData({ request, statusToken, phrase: "", canSubmit: false });
      wx.showModal({
        title: "注销申请已提交",
        content: "本机登录已清除。你可以在当前页面查看处理进度，或回到首页。",
        showCancel: false
      });
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "注销申请提交失败，请稍后重试。") });
    } finally {
      this.setData({ submitting: false });
    }
  },

  async refresh() {
    const request = this.data.request;
    const token = this.data.statusToken;
    if (request && request.id && token) await this.refreshStatus(request.id, token);
  },

  async refreshStatus(id: string, token: string) {
    this.setData({ refreshing: true, error: "" });
    try {
      const request = await appService.deletionStatus(id, token);
      this.setData({ request, statusToken: token });
    } catch (error) {
      this.setData({ error: userError(error, "注销进度查询失败，请检查凭证或稍后重试。") });
    } finally {
      this.setData({ refreshing: false });
    }
  },

  goHome() {
    wx.reLaunch({ url: "/pages/welcome/index" });
  }
});
