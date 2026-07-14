import { decorateMoment } from "../../core/format";

Component({
  properties: { item: { type: Object, value: {} } },
  data: { display: {} },
  observers: {
    item(this: any, value: any) { if (value && value.id) this.setData({ display: decorateMoment(value) }); }
  },
  methods: {
    open(this: any) { this.triggerEvent("open", { id: this.data.display.id }); },
    keepVideoControl() { /* Keep native video controls from bubbling to the card. */ },
    imageError(this: any, event: any) {
      const detail = event && event.detail ? event.detail : {};
      console.error("Timeline image failed", { errMsg: detail.errMsg, statusCode: detail.statusCode });
      const media = this.data.display && this.data.display.media && this.data.display.media[0];
      if (media && media.thumbnailPath && media.path && media.thumbnailPath !== media.path) {
        this.setData({ "display.media[0].thumbnailPath": "" });
        return;
      }
      wx.showToast({ title: "照片加载失败，请刷新后重试", icon: "none" });
    },
    videoError(_event: any) {
      wx.showToast({ title: "视频暂时无法播放，请进入详情后重试", icon: "none" });
    }
  }
});
