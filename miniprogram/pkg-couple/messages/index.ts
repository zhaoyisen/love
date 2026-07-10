import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { messages: [] as any[], unread: 0, loading: false, error: "" },
  async onShow() { await this.refresh(); },
  async refresh() {
    this.setData({ loading: true, error: "" });
    try {
      await appService.messages();
      this.render();
    } catch (error) {
      if (!redirectExpiredSession()) {
        this.render();
        this.setData({ error: userError(error, "信笺同步失败，当前展示最近一次保存的内容。") });
      }
    } finally {
      this.setData({ loading: false });
    }
  },
  render() {
    const messages = store.getState().messages;
    this.setData({ messages, unread: messages.filter((item) => !item.read).length });
  },
  async readAll() {
    if (!this.data.unread) return;
    try {
      await appService.readAllMessages();
      this.render();
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "标记已读失败"), icon: "none" });
    }
  },
  async open(event: any) {
    const messageId = event.currentTarget.dataset.messageId;
    const momentId = event.currentTarget.dataset.momentId;
    if (messageId) {
      try { await appService.readMessage(messageId); this.render(); }
      catch (_) {}
    }
    if (momentId) wx.navigateTo({ url: `/pkg-moment/detail/index?id=${momentId}` });
  }
});
