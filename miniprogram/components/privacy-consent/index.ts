Component({
  data: { visible: false },
  lifetimes: {
    detached(this: any) {
      if (this.privacyResolver) this.privacyResolver({ event: "disagree" });
      this.privacyResolver = null;
    }
  },
  methods: {
    open(this: any, resolve: (result: { event: "agree" | "disagree"; buttonId?: string }) => void) {
      if (this.privacyResolver) this.privacyResolver({ event: "disagree" });
      this.privacyResolver = resolve;
      this.setData({ visible: true });
    },
    agree(this: any) {
      const resolve = this.privacyResolver;
      this.privacyResolver = null;
      this.setData({ visible: false });
      wx.setStorageSync("love-notes:privacy-authorized:v1", { authorizedAt: new Date().toISOString() });
      if (resolve) resolve({ event: "agree", buttonId: "privacy-agree-button" });
    },
    disagree(this: any) {
      const resolve = this.privacyResolver;
      this.privacyResolver = null;
      this.setData({ visible: false });
      if (resolve) resolve({ event: "disagree" });
      wx.showToast({ title: "未授权，无法使用这项功能", icon: "none" });
    },
    openContract() {
      if (wx.openPrivacyContract) {
        wx.openPrivacyContract({
          fail: () => wx.navigateTo({ url: "/pkg-profile/agreement/index?type=privacy" })
        });
      } else {
        wx.navigateTo({ url: "/pkg-profile/agreement/index?type=privacy" });
      }
    },
    stopPropagation() {}
  }
});
