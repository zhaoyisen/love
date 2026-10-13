import { decorateMoment } from "../../core/format";
import { mediaCache } from "../../core/media-cache";
import { store } from "../../core/store";
import { hasSession } from "../../services/request";

Component({
  properties: {
    item: { type: Object, value: {} },
    eager: { type: Boolean, value: false },
    partnerName: { type: String, value: "TA" },
    partnerInitial: { type: String, value: "TA" }
  },
  data: { display: {}, mediaError: false, coverPath: "", coverSource: "", coverOwner: "", coverAssetId: "" },
  observers: {
    item(this: any, value: any) {
      const normalized = value && value.id ? {
        ...value,
        media: Array.isArray(value.media) ? value.media : [],
        comments: Array.isArray(value.comments) ? value.comments : [],
        events: Array.isArray(value.events) ? value.events : []
      } : null;
      const media = normalized?.media[0];
      const coverSource = media?.thumbnailPath || (normalized?.mediaType === "IMAGE" ? media?.path : "") || "";
      const coverOwner = store.getState().loggedIn && hasSession() ? store.getState().profile.id || "" : "";
      const coverAssetId = media?.status === "READY" ? media.assetId || "" : "";
      this.setData({
        display: normalized ? decorateMoment(normalized) : {},
        mediaError: false,
        coverPath: mediaCache.get(coverOwner, coverAssetId, coverSource, normalized?.author === "TA") || coverSource,
        coverSource, coverOwner, coverAssetId
      });
    }
  },
  methods: {
    coverLoaded(this: any) {
      if (!hasSession() || !store.getState().loggedIn || this.data.coverOwner !== store.getState().profile.id) return;
      if (this.data.coverPath !== this.data.coverSource) return;
      // 封面显示后保存为账号隔离的本地文件，下一次进入直接读取，不依赖签名 URL 缓存。
      void mediaCache.remember(this.data.coverOwner, this.data.coverAssetId, this.data.coverSource, this.data.display.author === "TA");
    },
    open(this: any) {
      if (this.data.display && this.data.display.id) {
        this.triggerEvent("open", { id: this.data.display.id });
      }
    },
    imageError(this: any, event: any) {
      const detail = event && event.detail ? event.detail : {};
      console.error("Timeline image failed", { errMsg: detail.errMsg, statusCode: detail.statusCode });
      const media = this.data.display && this.data.display.media && this.data.display.media[0];
      if (this.data.coverPath !== this.data.coverSource && this.data.coverSource) {
        mediaCache.forget(this.data.coverOwner, this.data.coverAssetId, this.data.coverSource);
        this.setData({ coverPath: this.data.coverSource });
        return;
      }
      if (media && media.thumbnailPath && this.data.display.mediaType === "IMAGE") {
        this.setData({ "display.media[0].thumbnailPath": "", coverPath: media.path || "", coverSource: media.path || "" });
        return;
      }
      this.setData({
        "display.media[0].thumbnailPath": "",
        mediaError: true
      });
    },
    videoError(_event: any) {
      wx.showToast({ title: "视频暂时无法播放，请进入详情后重试", icon: "none" });
    }
  }
});
