import { store } from "../../core/store";
import { mockApi } from "../../core/mock-api";
Page({
  data: { phrase: "", canConfirm: false, loading: false },
  input(event: any) { const phrase = event.detail.value; this.setData({ phrase, canConfirm: phrase === "确认解绑" }); },
  async confirm() { if (!this.data.canConfirm || this.data.loading) return; this.setData({ loading: true }); await mockApi.unbind(); wx.showModal({ title: "情侣空间已停止访问", content: "你仍可查看自己创建的记录。对方内容、云宠物和原情侣回顾已停止访问。", showCancel: false, success: () => wx.reLaunch({ url: "/pages-main/couple/index" }) }); }
});
