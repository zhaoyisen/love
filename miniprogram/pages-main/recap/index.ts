import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { recap: {} as any, count: 0, paired: false, loading: false, error: "" },
  async onShow() {
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 2 });
    this.setData({ loading: appService.isRemote, error: "" });
    try {
      if (appService.isRemote) {
        await appService.refresh();
        if (store.getState().couple.status === "PAIRED") await appService.recap(new Date().getFullYear());
      }
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "年度回顾同步失败，当前展示最近一次保存的内容。") });
    } finally {
      this.render();
      this.setData({ loading: false });
    }
  },
  render() { const state = store.getState(); this.setData({ recap: state.recap, count: state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED").length, paired: state.couple.status === "PAIRED" }); },
  create() { if (!this.data.paired) { wx.showToast({ title: "完成配对后可制作双人回顾", icon: "none" }); return; } wx.navigateTo({ url: "/pkg-recap/editor/index" }); },
  openCover() { if (this.data.recap.status === "READY") this.preview(); else this.create(); },
  preview() { wx.navigateTo({ url: "/pkg-recap/preview/index" }); }
});
