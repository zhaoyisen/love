import { store } from "../../core/store";
Page({
  data: { state: {} as any, storageText: "本地演示数据" },
  onShow() { const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 3 }); this.setData({ state: store.getState() }); },
  privacy() { wx.navigateTo({ url: "/pkg-couple/privacy/index" }); },
  recycle() { wx.navigateTo({ url: "/pkg-moment/recycle-bin/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); },
  toggle(event: any) { store.updatePreference(event.currentTarget.dataset.key, event.detail.value); this.onShow(); },
  reset() { wx.showModal({ title: "重置演示数据？", content: "这会清除当前所有本地操作并回到首次进入状态。", confirmText: "重置", confirmColor: "#8F3F3F", success: (res: any) => { if (res.confirm) { store.reset(); wx.reLaunch({ url: "/pages/welcome/index" }); } } }); },
  about() { wx.showModal({ title: "恋爱笔记 MVP", content: "原生微信小程序客户端演示版。真实上线需接入统一 API、内容安全、对象存储和微信登录。", showCancel: false }); }
});
