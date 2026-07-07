import { store } from "../../core/store";
import { appService } from "../../services/app-service";
Page({
  data: { recap: {} as any, count: 0, paired: false },
  onShow() { const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: -1 }); if (appService.isRemote) { this.setData({ recap: { title: "真实回顾暂未开放", year: new Date().getFullYear(), version: 1, status: "DRAFT" }, count: 0, paired: false }); return; } const state = store.getState(); this.setData({ recap: state.recap, count: state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED").length, paired: state.couple.status === "PAIRED" }); },
  create() { if (appService.isRemote) { wx.showToast({ title: "年度回顾暂未开放", icon: "none" }); return; } if (!this.data.paired) { wx.showToast({ title: "完成配对后可制作双人回顾", icon: "none" }); return; } wx.navigateTo({ url: "/pkg-recap/editor/index" }); },
  openCover() { if (this.data.recap.status === "READY") this.preview(); else this.create(); },
  preview() { wx.navigateTo({ url: "/pkg-recap/preview/index" }); }
});
