import { store } from "../../core/store";
import { visibleLabel, splitDate } from "../../core/format";
import { appService, promptModerationAppeal, redirectExpiredSession, userError } from "../../services/app-service";

Page({
  data: { draftId: "", draft: {} as any, date: {}, visibilityLabel: "", publishing: false, error: "", publishText: "确认发布" },
  onLoad(query: any) { const draft = store.getDraft(query.draftId); if (!draft) { wx.navigateBack(); return; } this.setData({ draftId: draft.id, draft, date: splitDate(draft.occurredAt), visibilityLabel: visibleLabel(draft.visibility) }); },
  edit() { wx.navigateBack(); },
  async publish() {
    if (this.data.publishing) return;
    this.setData({ publishing: true, error: "", publishText: this.data.draft.mediaType === "TEXT" ? "正在发布" : "准备安全上传" });
    const progressTimer = setInterval(() => {
      const current = store.getDraft(this.data.draftId);
      if (!current) return;
      const uploading = current.media.find((item) => item.status === "UPLOADING");
      this.setData({
        draft: current,
        publishText: uploading ? `正在上传 ${uploading.progress}%` : current.media.some((item) => item.status === "PROCESSING") ? "正在提交处理" : "正在发布"
      });
    }, 250);
    try {
      const moment = await appService.publish(this.data.draftId);
      if (!moment) { this.setData({ error: "草稿已失效，请返回重新编辑。" }); return; }
      wx.showToast({ title: "这一刻已收好", icon: "success" });
      setTimeout(() => wx.reLaunch({ url: "/pages-main/time/index" }), 700);
    } catch (error) {
      const current = store.getDraft(this.data.draftId);
      if (!redirectExpiredSession()) {
        promptModerationAppeal(error, `发布记录被拦截：${(current || this.data.draft).title || ""} ${(current || this.data.draft).body || ""}`);
        this.setData({ draft: current || this.data.draft, error: userError(error, "发布没有完成，草稿仍保存在本机，可直接重试。") });
      }
    } finally {
      clearInterval(progressTimer);
      this.setData({ publishing: false, publishText: "重试发布" });
    }
  }
});
