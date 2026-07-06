import { store } from "../../core/store";
import { visibleLabel, splitDate } from "../../core/format";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: { draftId: "", draft: {} as any, date: {}, visibilityLabel: "", publishing: false, error: "" },
  onLoad(query: any) { const draft = store.getDraft(query.draftId); if (!draft) { wx.navigateBack(); return; } this.setData({ draftId: draft.id, draft, date: splitDate(draft.occurredAt), visibilityLabel: visibleLabel(draft.visibility) }); },
  edit() { wx.navigateBack(); },
  async publish() {
    if (this.data.publishing) return;
    this.setData({ publishing: true, error: "" });
    try {
      const moment = await appService.publish(this.data.draftId);
      if (!moment) { this.setData({ error: "草稿已失效，请返回重新编辑。" }); return; }
      wx.showToast({ title: "这一刻已收好", icon: "success" });
      setTimeout(() => wx.reLaunch({ url: "/pages-main/time/index" }), 700);
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "发布没有完成，草稿仍保存在本机。") });
    } finally {
      this.setData({ publishing: false });
    }
  }
});
