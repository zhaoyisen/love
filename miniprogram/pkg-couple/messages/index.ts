import { store } from "../../core/store";
Page({
  data: { messages: [] as any[], unread: 0 },
  onShow() { const messages = store.getState().messages; this.setData({ messages, unread: messages.filter((item) => !item.read).length }); },
  readAll() { store.markMessagesRead(); this.onShow(); },
  open(event: any) { const id = event.currentTarget.dataset.id; if (id) wx.navigateTo({ url: `/pkg-moment/detail/index?id=${id}` }); }
});
