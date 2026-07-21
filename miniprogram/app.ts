import { store } from "./core/store";
import { reportClientIssue } from "./services/client-monitor";

App({
  globalData: { store },
  onLaunch() {
    store.initialize();
    this.configureUpdates();
    if (wx.onNeedPrivacyAuthorization) {
      wx.onNeedPrivacyAuthorization((resolve: (result: { event: "agree" | "disagree"; buttonId?: string }) => void) => {
        const pages = getCurrentPages();
        const page = pages[pages.length - 1] as any;
        const consent = page && page.selectComponent ? page.selectComponent("#privacy-consent") : null;
        if (consent && consent.open) {
          consent.open(resolve);
          return;
        }
        resolve({ event: "disagree" });
        wx.showToast({ title: "请先阅读并同意隐私保护指引", icon: "none" });
      });
    }
  },
  configureUpdates() {
    if (!wx.canIUse || !wx.canIUse("getUpdateManager")) return;
    const updateManager = wx.getUpdateManager();
    updateManager.onUpdateReady(() => {
      wx.showModal({
        title: "新版本已准备好",
        content: "更新后即可继续使用，未发布的草稿仍会保留。",
        confirmText: "立即更新",
        showCancel: false,
        success: () => updateManager.applyUpdate()
      });
    });
    updateManager.onUpdateFailed(() => {
      wx.showToast({ title: "更新下载失败，请稍后重新打开小程序", icon: "none", duration: 3000 });
    });
  },
  onError(error: string) {
    reportClientIssue("RUNTIME_ERROR", { error });
  },
  onUnhandledRejection(event: any) {
    const reason = event && event.reason;
    reportClientIssue("UNHANDLED_REJECTION", { reason: reason && reason.message ? reason.message : reason });
  }
});
