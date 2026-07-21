import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { messages: [] as any[], unread: 0, loading: false, loadingMore: false, error: "", page: 0, hasMore: false },
  async onShow() { await this.refresh(); },
  async refresh() {
    this.setData({ loading: true, error: "" });
    try {
      const result = await appService.messages(0);
      this.setData({ unread: result.unreadCount, page: 0, hasMore: result.hasMore });
      this.render(false);
    } catch (error) {
      if (!redirectExpiredSession()) {
        this.render();
        this.setData({ error: userError(error, "信笺同步失败，当前展示最近一次保存的内容。") });
      }
    } finally {
      this.setData({ loading: false });
    }
  },
  render(updateUnread = true) {
    const messages = store.getState().messages;
    const patch: any = { messages };
    if (updateUnread) patch.unread = messages.filter((item) => !item.read).length;
    this.setData(patch);
  },
  async loadMore() {
    if (this.data.loadingMore || !this.data.hasMore) return;
    const page = this.data.page + 1;
    this.setData({ loadingMore: true });
    try {
      const result = await appService.messages(page);
      this.setData({ page, hasMore: result.hasMore, unread: result.unreadCount });
      this.render(false);
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "更多信笺加载失败，请稍后重试。"), icon: "none" });
    } finally {
      this.setData({ loadingMore: false });
    }
  },
  async readAll() {
    if (!this.data.unread) return;
    try {
      await appService.readAllMessages();
      this.setData({ unread: 0 });
      this.render(false);
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "标记已读失败"), icon: "none" });
    }
  },
  async open(event: any) {
    const messageId = event.currentTarget.dataset.messageId;
    const momentId = event.currentTarget.dataset.momentId;
    if (messageId) {
      try {
        const wasUnread = store.getState().messages.some((item) => item.id === messageId && !item.read);
        await appService.readMessage(messageId);
        if (wasUnread) this.setData({ unread: Math.max(0, this.data.unread - 1) });
        this.render(false);
      }
      catch (_) {}
    }
    if (momentId) wx.navigateTo({ url: `/pkg-moment/detail/index?id=${momentId}` });
  }
});
