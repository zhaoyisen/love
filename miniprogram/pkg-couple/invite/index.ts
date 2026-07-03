import { store } from "../../core/store";
import { mockApi } from "../../core/mock-api";
Page({
  data: { stage: "create", loading: false, hours: 23, minutes: 59 },
  onLoad() { if (store.getState().couple.status === "PAIRED") this.setData({ stage: "done" }); },
  create() { this.setData({ stage: "waiting" }); },
  share() { wx.showShareMenu({ menus: ["shareAppMessage"] }); wx.showToast({ title: "可从右上角发送给 TA", icon: "none" }); },
  async simulateAccept() { this.setData({ loading: true, stage: "confirm" }); },
  async confirm() { this.setData({ loading: true }); await mockApi.acceptInvitation(); this.setData({ loading: false, stage: "done" }); },
  home() { wx.switchTab({ url: "/pages-main/couple/index" }); },
  onShareAppMessage() { return { title: "我想和你一起记录普通日子", path: "/pkg-couple/invite/index?token=demo_invite" }; }
});
