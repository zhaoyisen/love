import { store } from "../../core/store";
import { mediaCache } from "../../core/media-cache";
import { decorateMoment } from "../../core/format";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: {
    moment: {} as any,
    reactions: ["心动","抱抱","笑哭","懂你","对不起","收藏"],
    commentText: "",
    keyboardHeight: 0,
    keyboardOffset: 0,
    viewportHeight: 640,
    reactionIcons: ["reaction-heart", "reaction-hug", "reaction-laugh", "reaction-lightbulb", "reaction-frown", "reaction-bookmark"],
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
    myAvatarUrl: "", partnerAvatarUrl: "", myAvatarError: false, partnerAvatarError: false,
    failedMediaIds: [] as string[],
    retryingMediaId: ""
  },
  onLoad(query: any) { this.momentId = query.id; this.updateViewport(); },
  onShow() { this.updateViewport(); if (this.momentId) this.refresh(); },
  onHide() { this.mediaHidden = true; clearTimeout(this.pollTimer); this.commentBlur(); },
  onUnload() { this.mediaHidden = true; clearTimeout(this.pollTimer); },
  onResize(event: any) {
    if (this.commentFocused || this.data.keyboardHeight) this.keyboardChange({ detail: { height: this.data.keyboardHeight } });
    else this.updateViewport(event.size);
  },
  updateViewport(size?: any) {
    const info = size || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
    this.setData({ viewportHeight: Number(info.windowHeight) || this.data.viewportHeight });
  },
  keyboardChange(event: any) {
    const height = Math.max(0, Number(event.detail.height) || 0);
    const info = wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync();
    const resized = Math.max(0, this.data.viewportHeight - info.windowHeight);
    this.setData({ keyboardHeight: height, keyboardOffset: Math.max(0, height - resized) });
  },
  commentFocus() { this.updateViewport(); this.commentFocused = true; },
  commentBlur() { this.commentFocused = false; this.setData({ keyboardHeight: 0, keyboardOffset: 0 }); },
  momentId: "",
  pollTimer: null as any,
  commentFocused: false,
  mediaOwner: "",
  failedMediaSources: {} as Record<string, string>,
  mediaSavePending: false,
  mediaSaveQueued: false,
  renderMoment(moment: any) {
    const state = store.getState();
    const owner = state.profile.id || "";
    const partner = moment.author === "TA";
    const previous = this.mediaOwner === owner && this.data.moment.id === moment.id ? this.data.moment.media : [];
    this.mediaOwner = owner;
    const decorated = decorateMoment({ ...moment, media: moment.media.map((item: any) => {
      const displayed = item.assetId && item.path && (!partner || mediaCache.isUrlCurrent?.(item.path)) && previous?.find((media: any) => media.assetId === item.assetId
        && this.failedMediaSources[item.assetId] !== media.path
        && media.sourcePath?.split("?")[0] === item.path.split("?")[0]);
      return { ...item, sourcePath: item.path,
        path: moment.mediaType === "IMAGE" ? mediaCache.get(owner, item.assetId || "", item.path, partner)
          || displayed?.path || mediaCache.get(owner, item.assetId || "", item.thumbnailPath, partner) || item.path : item.path,
        thumbnailPath: mediaCache.get(owner, item.assetId || "", item.thumbnailPath, partner) || item.thumbnailPath };
    }) });
    const partnerName = state.couple.partnerName || "TA";
    const failedMediaIds = moment.author === "我" ? decorated.media.filter((item: any) => item.status === "FAILED" && item.assetId).map((item: any) => item.assetId) : [];
    this.setData({ moment: decorated, partnerName, partnerInitial: partnerName.slice(0, 1), failedMediaIds,
      myAvatarError: this.data.myAvatarUrl === (state.profile.avatarUrl || "") && this.data.myAvatarError,
      partnerAvatarError: this.data.partnerAvatarUrl === (state.couple.partnerAvatarUrl || "") && this.data.partnerAvatarError,
      myAvatarUrl: state.profile.avatarUrl || "", partnerAvatarUrl: state.couple.partnerAvatarUrl || "" });
    this.cacheCurrentMedia();
  },
  cacheCurrentMedia() {
    if (!mediaCache.remember || this.mediaHidden) return;
    if (this.mediaSavePending) { this.mediaSaveQueued = true; return; }
    const moment = this.data.moment;
    const item = moment.media?.[this.data.mediaIndex] || moment.media?.[0];
    const owner = this.mediaOwner, partner = moment.author === "TA";
    if (!item || item.status !== "READY" || !item.assetId || !owner || store.getState().profile.id !== owner || !appService.hasSession()) return;
    const url = moment.mediaType === "IMAGE" ? item.sourcePath : item.thumbnailPath;
    if (!url) return;
    this.mediaSavePending = true;
    void mediaCache.remember(owner, item.assetId, url, partner).then(() => {
      if (this.mediaHidden || this.data.moment.id !== moment.id || store.getState().profile.id !== owner || !appService.hasSession()) return;
      const index = this.data.moment.media?.findIndex((media: any) => media.assetId === item.assetId);
      const current = this.data.moment.media?.[index];
      const field = moment.mediaType === "IMAGE" ? "path" : "thumbnailPath";
      if (!current || current.sourcePath?.split("?")[0] !== item.sourcePath?.split("?")[0]) return;
      const currentUrl = field === "path" ? current.sourcePath : current.thumbnailPath;
      const cached = mediaCache.get(owner, item.assetId, currentUrl, this.data.moment.author === "TA");
      if (cached && current[field] !== cached) this.setData({ [`moment.media[${index}].${field}`]: cached });
    }).finally(() => {
      this.mediaSavePending = false;
      if (this.mediaSaveQueued) { this.mediaSaveQueued = false; this.cacheCurrentMedia(); }
    });
  },
  mediaHidden: false,
  avatarError(event: any) { this.setData({ [event.currentTarget.dataset.avatar === "my" ? "myAvatarError" : "partnerAvatarError"]: true }); },
  imageError(event: any) {
    const detail = event && event.detail ? event.detail : {};
    console.error("Moment image failed", { errMsg: detail.errMsg, statusCode: detail.statusCode });
    const index = Number(event.currentTarget?.dataset?.index || 0);
    const item = this.data.moment.media?.[index];
    if (item?.assetId) this.failedMediaSources[item.assetId] = item.path;
    if (item?.sourcePath && item.path !== item.sourcePath) {
      mediaCache.forget(store.getState().profile.id || "", item.assetId || "", item.sourcePath);
      this.setData({ [`moment.media[${index}].path`]: item.sourcePath });
      return;
    }
    wx.showToast({ title: "照片加载失败，请刷新后重试", icon: "none" });
  },
  videoError(event: any) {
    const detail = event && event.detail ? event.detail : {};
    console.error("Video playback failed", { errMsg: detail.errMsg, errCode: detail.errCode });
    wx.showToast({ title: "视频播放失败，请检查视频格式或稍后重试", icon: "none" });
  },
  mediaChange(event: any) { this.setData({ mediaIndex: Number(event.detail.current || 0) }); this.cacheCurrentMedia(); },
  async refresh() {
    this.mediaHidden = false;
    const cached = store.getMoment(this.momentId);
    if (cached && (!appService.isRemote || appService.hasSession?.())
        && (cached.author === "我" || store.getState().couple.status === "PAIRED")) this.renderMoment(cached);
    this.setData({ loading: true, error: "" });
    try {
      const moment = appService.isRemote ? await appService.detail(this.momentId) : store.getMoment(this.momentId);
      if (!moment) throw new Error("这条记录不存在或已经失效。");
      if (this.mediaHidden) return;
      this.renderMoment(moment);
      clearTimeout(this.pollTimer);
      if (appService.isRemote && moment.status === "UPLOADING") this.pollTimer = setTimeout(() => this.refresh(), 5000);
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "内容不可访问或已经失效。") });
    } finally { this.setData({ loading: false }); }
  },
  async react(event: any) {
    if (this.data.reactionSaving || this.data.loading || this.data.moment.author === "我" || this.data.moment.visibility !== "SHARED") return;
    const value = event.currentTarget.dataset.value;
    if (!this.data.reactions.includes(value)) return;
    this.setData({ reactionSaving: true, error: "" });
    try {
      const moment = await appService.reactMoment(this.momentId, value);
      if (moment) this.renderMoment(moment);
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
    if (this.data.commentSending || this.data.loading || this.data.moment.visibility !== "SHARED") return;
    const body = this.data.commentText.trim();
    if (!body) return;
    this.setData({ commentSending: true, error: "" });
    try {
      const moment = await appService.commentMoment(this.momentId, body);
      if (moment) { this.renderMoment(moment); this.setData({ commentText: "" }); }
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
          if (moment) this.renderMoment(moment);
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
