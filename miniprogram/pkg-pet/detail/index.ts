import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { pet: {} as any, paired: false, loading: false, acting: false, error: "" },
  async onShow() { await this.refresh(); },
  async refresh() {
    this.setData({ loading: appService.isRemote, error: "" });
    try {
      if (appService.isRemote) await appService.pet();
      this.render();
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "团子暂时没有同步成功，请稍后重试。") });
      this.render();
    } finally {
      this.setData({ loading: false });
    }
  },
  render() {
    const state = store.getState();
    this.setData({ pet: state.pet, paired: state.couple.status === "PAIRED" });
  },
  async action(event: any) {
    if (!this.data.paired || this.data.acting) return;
    this.setData({ acting: true, error: "" });
    try {
      const result = await appService.petAction(event.currentTarget.dataset.action);
      this.render();
      wx.showToast({ title: result.changed ? `团子很开心 +${result.growthDelta || 8}` : "今天已经做过啦", icon: "none" });
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "互动没有完成，请稍后重试。"), icon: "none" });
    } finally {
      this.setData({ acting: false });
    }
  }
});
