import { decorateMoment } from "../../core/format";

Component({
  properties: {
    item: { type: Object, value: {} },
    eager: { type: Boolean, value: false },
    partnerName: { type: String, value: "TA" },
    partnerInitial: { type: String, value: "TA" }
  },
  data: { display: {}, mediaError: false },
  observers: {
    item(this: any, value: any) {
      const normalized = value && value.id ? {
        ...value,
        media: Array.isArray(value.media) ? value.media : [],
        comments: Array.isArray(value.comments) ? value.comments : [],
        events: Array.isArray(value.events) ? value.events : []
      } : null;
      this.setData({
        display: normalized ? decorateMoment(normalized) : {},
        mediaError: false
      });
    }
  },
  methods: {
    open(this: any) {
      if (this.data.display && this.data.display.id) {
        this.triggerEvent("open", { id: this.data.display.id });
      }
    },
    imageError(this: any, event: any) {
      const detail = event && event.detail ? event.detail : {};
      console.error("Timeline image failed", { errMsg: detail.errMsg, statusCode: detail.statusCode });
      const media = this.data.display && this.data.display.media && this.data.display.media[0];
      if (media && media.thumbnailPath && this.data.display.mediaType === "IMAGE") {
        this.setData({ "display.media[0].thumbnailPath": "" });
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
