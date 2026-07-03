import { store } from "../../core/store";
import { mockApi } from "../../core/mock-api";
import { visibleLabel, splitDate } from "../../core/format";

Page({
  data: { draftId: "", draft: {} as any, date: {}, visibilityLabel: "", publishing: false },
  onLoad(query: any) { const draft = store.getDraft(query.draftId); if (!draft) { wx.navigateBack(); return; } this.setData({ draftId: draft.id, draft, date: splitDate(draft.occurredAt), visibilityLabel: visibleLabel(draft.visibility) }); },
  edit() { wx.navigateBack(); },
  async publish() {
    if (this.data.publishing) return; this.setData({ publishing: true });
    const moment = await mockApi.publish(this.data.draftId);
    if (!moment) { this.setData({ publishing: false }); wx.showToast({ title: "草稿已失效", icon: "none" }); return; }
    wx.showToast({ title: "这一刻已收好", icon: "success" });
    setTimeout(() => wx.reLaunch({ url: "/pages-main/time/index" }), 700);
  }
});
