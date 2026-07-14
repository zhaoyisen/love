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
    videoError(_event: any) {
      wx.showToast({ title: "视频暂时无法播放，请进入详情后重试", icon: "none" });
    }
  }
});
