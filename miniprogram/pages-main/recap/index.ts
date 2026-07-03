import { store } from "../../core/store";
Page({
  data: { recap: {} as any, count: 0, paired: false },
  onShow() { const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 2 }); const state = store.getState(); this.setData({ recap: state.recap, count: state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED").length, paired: state.couple.status === "PAIRED" }); },
  create() { if (!this.data.paired) { wx.showToast({ title: "完成配对后可制作双人回顾", icon: "none" }); return; } wx.navigateTo({ url: "/pkg-recap/editor/index" }); },
  openCover() { if (this.data.recap.status === "READY") this.preview(); else this.create(); },
  preview() { wx.navigateTo({ url: "/pkg-recap/preview/index" }); }
});
