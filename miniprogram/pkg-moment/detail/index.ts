import { store } from "../../core/store";
import { mediaCache } from "../../core/media-cache";
import { decorateMoment } from "../../core/format";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: {
    moment: {} as any,
    reactions: ["心动","抱抱","笑哭","懂你","对不起","收藏"],
    commentText: "",
    loading: false,
    error: "",
    isRemote: appService.isRemote,
    reactionSaving: false,
    commentSending: false,
    deleting: false,
    showMenu: false,
    showTrashConfirm: false,
    trashError: "",
    mediaIndex: 0,
    partnerName: "TA",
    partnerInitial: "TA",
    failedMediaIds: [] as string[],
    retryingMediaId: ""
  },
  onLoad(query: any) { this.momentId = query.id; },
  onShow() { if (this.momentId) this.refresh(); },
  onHide() { clearTimeout(this.pollTimer); },
  onUnload() { clearTimeout(this.pollTimer); },
  momentId: "",
  pollTimer: null as any,
  imageError(event: any) {
    const detail = event && event.detail ? event.detail : {};
    console.error("Moment image failed", { errMsg: detail.errMsg, statusCode: detail.statusCode });
    wx.showToast({ title: "照片加载失败，请刷新后重试", icon: "none" });
  },
  videoError(event: any) {
    const detail = event && event.detail ? event.detail : {};
    console.error("Video playback failed", { errMsg: detail.errMsg, errCode: detail.errCode });
    wx.showToast({ title: "视频播放失败，请检查视频格式或稍后重试", icon: "none" });
  },
  mediaChange(event: any) { this.setData({ mediaIndex: Number(event.detail.current || 0) }); },
  async refresh() {
    this.setData({ loading: true, error: "" });
    try {
      const moment = appService.isRemote ? await appService.detail(this.momentId) : store.getMoment(this.momentId);
      if (!moment) throw new Error("这条记录不存在或已经失效。");
      const partnerName = store.getState().couple.partnerName || "TA";
      const decorated = decorateMoment({ ...moment, media: moment.media.map((item: any) => ({ ...item,
        thumbnailPath: mediaCache.get(store.getState().profile.id || "", item.assetId || "", item.thumbnailPath) || item.thumbnailPath
      })) });
      const failedMediaIds = moment.author === "我" ? decorated.media.filter((item: any) => item.status === "FAILED" && item.assetId).map((item: any) => item.assetId) : [];
      this.setData({ moment: decorated, partnerName, partnerInitial: partnerName.slice(0, 1), failedMediaIds });
      clearTimeout(this.pollTimer);
      if (appService.isRemote && moment.status === "UPLOADING") this.pollTimer = setTimeout(() => this.refresh(), 5000);
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "内容不可访问或已经失效。") });
    } finally { this.setData({ loading: false }); }
  },
  async react(event: any) {
    if (this.data.reactionSaving) return;
    const value = event.currentTarget.dataset.value;
    this.setData({ reactionSaving: true, error: "" });
    try {
      const moment = await appService.reactMoment(this.momentId, value);
      if (moment) this.setData({ moment: decorateMoment(moment) });
      wx.showToast({ title: "回应已留下", icon: "none" });
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "回应没有保存，请稍后重试。"), icon: "none" });
    } finally {
      this.setData({ reactionSaving: false });
    }
  },
  async retryMedia(event: any) {
    const assetId = event.currentTarget.dataset.id;
    if (!assetId || this.data.retryingMediaId) return;
    this.setData({ retryingMediaId: assetId });
    try {
      await appService.retryMediaProcessing(assetId);
      wx.showToast({ title: "已重新提交处理", icon: "none" });
      await this.refresh();
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "重新处理失败，请稍后再试。"), icon: "none" });
    } finally {
      this.setData({ retryingMediaId: "" });
    }
  },
  commentInput(event: any) { this.setData({ commentText: event.detail.value }); },
  async sendComment() {
    if (this.data.commentSending) return;
    const body = this.data.commentText.trim();
    if (!body) return;
    this.setData({ commentSending: true, error: "" });
    try {
      const moment = await appService.commentMoment(this.momentId, body);
      if (moment) this.setData({ moment: decorateMoment(moment), commentText: "" });
      wx.showToast({ title: "短评已发送", icon: "none" });
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "短评没有发送，请稍后重试。"), icon: "none" });
    } finally {
      this.setData({ commentSending: false });
    }
  },
  removeComment(event: any) {
    const commentId = event.currentTarget.dataset.id;
    if (!commentId) return;
    wx.showModal({
      title: "删除这条短评？", content: "删除后，对方的信笺中也不会再保留这条短评。",
      confirmText: "删除", confirmColor: "#8F3F3F",
      success: async (res: any) => {
        if (!res.confirm) return;
        try {
          const moment = await appService.deleteComment(this.momentId, commentId);
          if (moment) this.setData({ moment: decorateMoment(moment) });
          wx.showToast({ title: "短评已删除", icon: "none" });
        } catch (error) {
          if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "短评删除失败，请刷新后重试。"), icon: "none" });
        }
      }
    });
  },
  menu() {
    this.setData({ showMenu: true, trashError: "" });
  },
  stopPropagation() {},
  closeMenu() {
    this.setData({ showMenu: false });
  },
  menuEdit() {
    this.setData({ showMenu: false });
    wx.navigateTo({ url: `/pkg-moment/edit/index?id=${this.momentId}` });
  },
  menuTrash() {
    this.setData({ showMenu: false, showTrashConfirm: true, trashError: "" });
  },
  menuFeedback() {
    this.setData({ showMenu: false });
    setTimeout(() => this.feedback(), 120);
  },
  menuPrivacy() {
    this.setData({ showMenu: false });
    wx.navigateTo({ url: "/pkg-couple/privacy/index" });
  },
  cancelTrash() {
    if (this.data.deleting) return;
    this.setData({ showTrashConfirm: false, trashError: "" });
  },
  feedback() {
    const labels = ["内容问题", "侵犯权益", "隐私问题", "审核申诉", "其他"];
    const categories = ["CONTENT_ISSUE", "RIGHTS_COMPLAINT", "PRIVACY_CONCERN", "MODERATION_APPEAL", "OTHER"] as const;
    wx.showActionSheet({
      itemList: labels,
      success: (res: any) => {
        const label = labels[res.tapIndex] || "其他";
        const category = categories[res.tapIndex] || "OTHER";
        setTimeout(() => {
          wx.showModal({
            title: "内容反馈",
            content: `将提交「${label}」反馈。紧急隐私风险请同时前往隐私设置单方解绑。`,
            confirmText: "提交反馈",
            success: async (modal: any) => {
              if (!modal.confirm) return;
              try {
                await appService.submitFeedback("MOMENT", this.momentId, category, `${label}：来自记录详情页的用户反馈。`);
                wx.showToast({ title: "反馈已提交", icon: "none" });
              } catch (error) {
                if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "反馈提交失败，请稍后重试。"), icon: "none" });
              }
            }
          });
        }, 180);
      }
    });
  },
  async confirmTrash() {
    if (this.data.deleting) return;
    this.setData({ deleting: true, trashError: "" });
    wx.showLoading({ title: "正在移入", mask: true });
    try {
      await appService.trashMoment(this.momentId, Number(this.data.moment.version || 0));
      wx.hideLoading();
      this.setData({ showTrashConfirm: false });
      wx.showToast({ title: "已移入回收站", icon: "success", duration: 900 });
      setTimeout(() => wx.navigateBack({ delta: 1 }), 450);
    } catch (error) {
      wx.hideLoading();
      if (!redirectExpiredSession()) {
        const message = userError(error, "移入回收站失败，请刷新后重试。");
        this.setData({ trashError: message });
        wx.showToast({ title: message, icon: "none", duration: 2500 });
      }
    } finally {
      this.setData({ deleting: false });
    }
  }
});
