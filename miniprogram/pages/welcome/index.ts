import { store } from "../../core/store";
import { mockApi } from "../../core/mock-api";

Page({
  data: { agreed: false, loading: false },
  onLoad() {
    if (store.getState().loggedIn) wx.switchTab({ url: "/pages-main/time/index" });
  },
  toggleAgree() { this.setData({ agreed: !this.data.agreed }); },
  openPrivacy() { wx.showModal({ title: "隐私说明", content: "你的记录默认私密。只有主动设为共同可见且情侣关系有效时，另一半才能查看。解绑后立即停止互访。", showCancel: false }); },
  async login() {
    if (!this.data.agreed) { wx.showToast({ title: "请先阅读并同意协议", icon: "none" }); return; }
    this.setData({ loading: true });
    await mockApi.login();
    wx.switchTab({ url: "/pages-main/time/index" });
  },
  explore() { this.setData({ agreed: true }); }
});
