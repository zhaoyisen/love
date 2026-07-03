import { decorateMoment } from "../../core/format";

Component({
  properties: { item: { type: Object, value: {} } },
  data: { display: {} },
  observers: {
    item(this: any, value: any) { if (value && value.id) this.setData({ display: decorateMoment(value) }); }
  },
  methods: {
    open(this: any) { this.triggerEvent("open", { id: this.data.display.id }); }
  }
});
