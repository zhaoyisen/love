import { store } from "../../core/store";
Page({
  data: { couple: {} as any, pet: {} as any, unread: 0, days: 0 },
  onShow() { const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 1 }); const state = store.getState(); this.setData({ couple: state.couple, pet: state.pet, unread: state.messages.filter((item) => !item.read).length, days: this.daysSince(state.couple.anniversary) }); },
  daysSince(value: string) { return Math.max(1, Math.floor((Date.now() - new Date(`${value}T00:00:00+08:00`).getTime()) / 86400000)); },
  invite() { wx.navigateTo({ url: "/pkg-couple/invite/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); },
  pet() { wx.navigateTo({ url: "/pkg-pet/detail/index" }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); }
});
