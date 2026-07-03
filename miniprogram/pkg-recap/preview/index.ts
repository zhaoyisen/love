import { store } from "../../core/store";
import { mockApi } from "../../core/mock-api";
import { decorateMoment } from "../../core/format";
Page({
  data: { recap: {} as any, moments: [] as any[], generating: false, showDisclosure: false },
  onShow() { const state = store.getState(); this.setData({ recap: state.recap, moments: state.recap.selectedMomentIds.map((id) => state.moments.find((item) => item.id === id)).filter(Boolean).map(decorateMoment) }); },
  toggleDisclosure() { this.setData({ showDisclosure: !this.data.showDisclosure }); },
  async generate() { this.setData({ generating: true }); await mockApi.generateRecap(); this.setData({ generating: false, recap: store.getState().recap }); wx.showToast({ title: "长图已生成", icon: "success" }); },
  save() { if (this.data.recap.status !== "READY") { wx.showToast({ title: "请先生成长图", icon: "none" }); return; } wx.showModal({ title: "保存到相册", content: "真实版本会在此时按需申请相册权限。本演示未生成实际图片文件。", showCancel: false }); }
});
