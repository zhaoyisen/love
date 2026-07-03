import { store } from "../../core/store";
Page({
  data: { moments: [] as any[] },
  onShow() { this.setData({ moments: store.getState().moments.filter((item) => item.status === "DELETED" && item.author === "我") }); },
  restore(event: any) { store.restoreMoment(event.currentTarget.dataset.id); wx.showToast({ title: "已恢复", icon: "success" }); this.onShow(); }
});
