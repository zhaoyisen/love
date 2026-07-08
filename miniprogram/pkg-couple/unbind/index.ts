import { appService, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { phrase: "", canConfirm: false, loading: false, error: "" },
  input(event: any) { const phrase = event.detail.value; this.setData({ phrase, canConfirm: phrase === "确认解绑" }); },
  async confirm() {
    if (!this.data.canConfirm || this.data.loading) return;
    this.setData({ loading: true, error: "" });
    try {
      await appService.unbind(this.data.phrase);
      wx.showModal({ title: "情侣空间已停止访问", content: "你仍可查看自己创建的记录。对方内容、云宠物和原情侣回顾已停止访问。", showCancel: false, success: () => wx.reLaunch({ url: "/pages-main/couple/index" }) });
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "解绑没有完成，请刷新状态后重试。") });
    } finally {
      this.setData({ loading: false });
    }
  }
});
