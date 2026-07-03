import { store } from "../../core/store";
Page({
  data: { defaultVisibility: "PRIVATE", paired: false },
  onShow() { const state = store.getState(); this.setData({ defaultVisibility: state.profile.defaultVisibility, paired: state.couple.status === "PAIRED" }); },
  setVisibility(event: any) { const value = event.currentTarget.dataset.value; if (value === "SHARED" && !this.data.paired) { wx.showToast({ title: "配对后才可设为默认", icon: "none" }); return; } store.updateDefaultVisibility(value); this.setData({ defaultVisibility: value }); },
  unbind() { wx.navigateTo({ url: "/pkg-couple/unbind/index" }); }
});
