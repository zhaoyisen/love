import { store } from "../../core/store";
Page({
  data: { messages: [] as any[] },
  onShow() { this.setData({ messages: store.getState().messages }); },
  readAll() { store.markMessagesRead(); this.onShow(); },
  open(event: any) { const id = event.currentTarget.dataset.id; if (id) wx.navigateTo({ url: `/pkg-moment/detail/index?id=${id}` }); }
});
