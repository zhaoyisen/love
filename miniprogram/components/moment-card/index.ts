import { decorateMoment } from "../../core/format";
import { mediaCache } from "../../core/media-cache";
import { store } from "../../core/store";
import { hasSession } from "../../services/request";

Component({
  properties: {
    item: { type: Object, value: {} },
    eager: { type: Boolean, value: false },
    partnerName: { type: String, value: "TA" },
    partnerAvatarUrl: { type: String, value: "" },
    myAvatarUrl: { type: String, value: "" },
    myInitial: { type: String, value: "我" },
    partnerInitial: { type: String, value: "TA" }
  },
  data: { display: {}, mediaError: false, coverPath: "", coverSource: "", coverOwner: "", coverAssetId: "", avatarError: false, responseIsMe: false },
  lifetimes: { detached(this: any) { this.coverDetached = true; } },
  observers: {
    "myAvatarUrl, partnerAvatarUrl"(this: any) { this.setData({ avatarError: false }); },
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
        responseIsMe: (normalized?.reaction?.actor || normalized?.comments[normalized.comments.length - 1]?.author) === "我",
        mediaError: false,
        coverPath: mediaCache.get(coverOwner, coverAssetId, coverSource, normalized?.author === "TA") || coverSource,
        coverSource, coverOwner, coverAssetId
      });
    }
  },
  methods: {
    avatarFailed(this: any) { this.setData({ avatarError: true }); },
    async coverLoaded(this: any) {
      if (!hasSession() || !store.getState().loggedIn || this.data.coverOwner !== store.getState().profile.id) return;
      if (this.data.coverPath !== this.data.coverSource) return;
      // 封面显示后保存为账号隔离的本地文件，下一次进入直接读取，不依赖签名 URL 缓存。
      const { coverOwner, coverAssetId, coverSource } = this.data;
      const path = await mediaCache.remember(coverOwner, coverAssetId, coverSource, this.data.display.author === "TA");
      if (!this.coverDetached && hasSession() && store.getState().loggedIn && store.getState().profile.id === coverOwner
          && this.data.coverSource === coverSource && this.data.coverAssetId === coverAssetId && path !== coverSource) this.setData({ coverPath: path });
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
