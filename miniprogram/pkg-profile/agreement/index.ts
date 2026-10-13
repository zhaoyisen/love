Page({
  data: { type: "terms", title: "用户协议" },
  onLoad(query: any) {
    const type = query.type === "privacy" ? "privacy" : "terms";
    const title = type === "privacy" ? "隐私说明" : "用户协议";
    this.setData({ type, title });
    wx.setNavigationBarTitle({ title });
  },
  openPrivacyContract() {
    if (!wx.openPrivacyContract) {
      wx.showToast({ title: "请在最新版本微信中查看", icon: "none" });
      return;
    }
    wx.openPrivacyContract({ fail: () => wx.showToast({ title: "隐私保护指引尚未在公众平台发布", icon: "none" }) });
  }
});
