import { store } from "../../core/store";
import { decorateMoment } from "../../core/format";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: { moment: {} as any, reactions: ["心动","抱抱","笑哭","懂你","对不起","收藏"], commentText: "", loading: false, error: "", isRemote: appService.isRemote },
  onLoad(query: any) { this.momentId = query.id; },
  onShow() { if (this.momentId) this.refresh(); },
  onHide() { clearTimeout(this.pollTimer); },
  onUnload() { clearTimeout(this.pollTimer); },
  momentId: "",
  pollTimer: null as any,
  async refresh() {
    this.setData({ loading: true, error: "" });
    try {
      const moment = appService.isRemote ? await appService.detail(this.momentId) : store.getMoment(this.momentId);
      if (!moment) throw new Error("这条记录不存在或已经失效。");
      this.setData({ moment: decorateMoment(moment) });
      clearTimeout(this.pollTimer);
      if (appService.isRemote && moment.status === "UPLOADING") this.pollTimer = setTimeout(() => this.refresh(), 5000);
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "内容不可访问或已经失效。") });
    } finally { this.setData({ loading: false }); }
  },
  react(event: any) { if (appService.isRemote) { wx.showToast({ title: "真实回应将在下一轮接入", icon: "none" }); return; } store.react(this.momentId, event.currentTarget.dataset.value); this.refresh(); wx.showToast({ title: "回应已留下", icon: "none" }); },
  commentInput(event: any) { this.setData({ commentText: event.detail.value }); },
  sendComment() { if (appService.isRemote) { wx.showToast({ title: "真实短评将在下一轮接入", icon: "none" }); return; } const body = this.data.commentText.trim(); if (!body) return; store.comment(this.momentId, body); this.setData({ commentText: "" }); this.refresh(); },
  menu() {
    const mine = this.data.moment.author === "我";
    wx.showActionSheet({ itemList: mine ? ["编辑记录", "移入回收站", "内容反馈"] : ["内容反馈", "隐私与关系设置"], success: (res: any) => {
      if (mine && res.tapIndex === 0) wx.navigateTo({ url: `/pkg-moment/edit/index?id=${this.momentId}` });
      if (mine && res.tapIndex === 1) this.remove();
      if ((!mine && res.tapIndex === 1)) wx.navigateTo({ url: "/pkg-couple/privacy/index" });
      if ((mine && res.tapIndex === 2) || (!mine && res.tapIndex === 0)) wx.showModal({ title: "内容反馈", content: "反馈入口已记录。紧急情况下可前往隐私设置单方解绑。", showCancel: false });
    }});
  },
  remove() { wx.showModal({ title: "移入回收站？", content: "对方将立即无法访问。你可以在 30 天内恢复。", confirmText: "移入回收站", confirmColor: "#8F3F3F", success: async (res: any) => { if (!res.confirm) return; try { await appService.trashMoment(this.momentId, this.data.moment.version || 0); wx.showToast({ title: "已移入回收站", icon: "none" }); setTimeout(() => wx.navigateBack(), 500); } catch (error) { if (!redirectExpiredSession()) this.setData({ error: userError(error, "删除没有完成，请刷新后重试。") }); } } }); }
});
