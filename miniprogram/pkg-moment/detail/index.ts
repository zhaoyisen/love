import { store } from "../../core/store";
import { decorateMoment } from "../../core/format";

Page({
  data: { moment: {} as any, reactions: ["心动","抱抱","笑哭","懂你","对不起","收藏"], commentText: "" },
  onLoad(query: any) { this.momentId = query.id; this.refresh(); },
  momentId: "",
  refresh() { const moment = store.getMoment(this.momentId); if (!moment) { wx.showModal({ title: "内容不可访问", content: "这条记录已删除、关系已结束或你没有查看权限。", showCancel: false, complete: () => wx.navigateBack() }); return; } this.setData({ moment: decorateMoment(moment) }); },
  react(event: any) { store.react(this.momentId, event.currentTarget.dataset.value); this.refresh(); wx.showToast({ title: "回应已留下", icon: "none" }); },
  commentInput(event: any) { this.setData({ commentText: event.detail.value }); },
  sendComment() { const body = this.data.commentText.trim(); if (!body) return; store.comment(this.momentId, body); this.setData({ commentText: "" }); this.refresh(); },
  menu() {
    const mine = this.data.moment.author === "我";
    wx.showActionSheet({ itemList: mine ? ["编辑记录", "移入回收站", "内容反馈"] : ["内容反馈", "隐私与关系设置"], success: (res: any) => {
      if (mine && res.tapIndex === 0) wx.showToast({ title: "当前演示保留原记录版本", icon: "none" });
      if (mine && res.tapIndex === 1) this.remove();
      if ((!mine && res.tapIndex === 1)) wx.navigateTo({ url: "/pkg-couple/privacy/index" });
      if ((mine && res.tapIndex === 2) || (!mine && res.tapIndex === 0)) wx.showModal({ title: "内容反馈", content: "反馈入口已记录。紧急情况下可前往隐私设置单方解绑。", showCancel: false });
    }});
  },
  remove() { wx.showModal({ title: "移入回收站？", content: "对方将立即无法访问。你可以在 30 天内恢复。", confirmText: "移入回收站", confirmColor: "#8F3F3F", success: (res: any) => { if (res.confirm) { store.deleteMoment(this.momentId); wx.showToast({ title: "已移入回收站", icon: "none" }); setTimeout(() => wx.navigateBack(), 500); } } }); }
});
