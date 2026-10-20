import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { recap: {} as any, count: 0, selectedCount: 0, coverPath: "", paired: false, loading: true, error: "", unread: 0 },
  async onShow() {
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 2 });
    this.setData({ loading: appService.isRemote, error: "" });
    this.render();
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
  render() {
    const state = store.getState();
    const sharedMoments = state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED");
    const selectedMoments = state.recap.selectedMomentIds.map((id) => sharedMoments.find((item) => item.id === id)).filter(Boolean) as any[];
    let coverPath = "";
    for (const moment of selectedMoments) {
      const media = (moment.media || []).find((item: any) => (item.type === "IMAGE" && item.path) || item.thumbnailPath);
      if (media) { coverPath = media.thumbnailPath || media.path || ""; break; }
    }
    this.setData({ recap: state.recap, count: sharedMoments.length, selectedCount: selectedMoments.length, coverPath, paired: state.couple.status === "PAIRED", unread: state.messages.filter(item => !item.read).length });
  },
  create() { if (!this.data.paired) { wx.showToast({ title: "完成配对后可制作双人回顾", icon: "none" }); return; } wx.navigateTo({ url: "/pkg-recap/editor/index" }); },
  openCover() { if (this.data.recap.status === "READY") this.preview(); else this.create(); },
  preview() { wx.navigateTo({ url: "/pkg-recap/preview/index" }); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  compose() { wx.navigateTo({ url: "/pkg-compose/composer/index" }); }
});
