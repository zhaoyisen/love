import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { moments: [] as any[], loading: false, error: "", restoringId: "" },
  async onShow() {
    this.setData({ loading: true, error: "" });
    try { this.setData({ moments: await appService.trashList() }); }
    catch (error) { if (!redirectExpiredSession()) this.setData({ error: userError(error, "回收站读取失败，请重试。") }); }
    finally { this.setData({ loading: false }); }
  },
  async restore(event: any) {
    const id = event.currentTarget.dataset.id;
    this.setData({ restoringId: id, error: "" });
    try { await appService.restoreMoment(id); wx.showToast({ title: "已恢复", icon: "success" }); await this.onShow(); }
    catch (error) { if (!redirectExpiredSession()) this.setData({ error: userError(error, "恢复失败，请刷新后重试。") }); }
    finally { this.setData({ restoringId: "" }); }
  }
});
