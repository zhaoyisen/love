import { store } from "../../core/store";
import { appService, promptModerationAppeal, redirectExpiredSession, userError } from "../../services/app-service";

const moods = ["开心","心动","平静","想念","委屈","生气","和好","其他"];
const eventValues = ["日常","约会","旅行","纪念日","第一次","争执","和好","礼物","共同成长","其他"];

Page({
  data: {
    id: "", version: 0, title: "", body: "", occurredAt: "", selectedDate: "", visibility: "PRIVATE",
    mood: "", selectedEvents: [] as string[], moods,
    eventOptions: eventValues.map((value) => ({ value, active: false })), paired: false,
    titleLeft: 30, bodyLeft: 1000, loading: true, saving: false, error: ""
  },
  async onLoad(query: any) {
    this.setData({ id: query.id, paired: store.getState().couple.status === "PAIRED" });
    try {
      const moment = appService.isRemote ? await appService.detail(query.id) : store.getMoment(query.id);
      if (!moment || moment.author !== "我") throw new Error("只有创建者可以编辑这条记录。");
      this.setData({
        version: moment.version || 0, title: moment.title, body: moment.body,
        occurredAt: moment.occurredAt, selectedDate: this.dateValue(new Date(moment.occurredAt)),
        visibility: moment.visibility, mood: moment.mood, selectedEvents: moment.events,
        eventOptions: eventValues.map((value) => ({ value, active: moment.events.includes(value) })),
        titleLeft: 30 - moment.title.length, bodyLeft: 1000 - moment.body.length
      });
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "记录读取失败，请返回后重试。") });
    } finally { this.setData({ loading: false }); }
  },
  dateValue(date: Date) { const month = `${date.getMonth() + 1}`.padStart(2, "0"); const day = `${date.getDate()}`.padStart(2, "0"); return `${date.getFullYear()}-${month}-${day}`; },
  titleInput(event: any) { const title = event.detail.value; this.setData({ title, titleLeft: 30 - title.length, error: "" }); },
  bodyInput(event: any) { const body = event.detail.value; this.setData({ body, bodyLeft: 1000 - body.length, error: "" }); },
  selectMood(event: any) { this.setData({ mood: event.currentTarget.dataset.value }); },
  toggleEvent(event: any) {
    const value = event.currentTarget.dataset.value;
    const selectedEvents = [...this.data.selectedEvents];
    const index = selectedEvents.indexOf(value);
    if (index >= 0) selectedEvents.splice(index, 1);
    else if (selectedEvents.length < 3) selectedEvents.push(value);
    else { wx.showToast({ title: "事件标签最多选 3 个", icon: "none" }); return; }
    this.setData({ selectedEvents, eventOptions: eventValues.map((item) => ({ value: item, active: selectedEvents.includes(item) })) });
  },
  dateChange(event: any) {
    const date = new Date(this.data.occurredAt);
    const [year, month, day] = event.detail.value.split("-").map(Number);
    date.setFullYear(year, month - 1, day);
    this.setData({ selectedDate: event.detail.value, occurredAt: date.toISOString() });
  },
  visibility(event: any) {
    const value = event.currentTarget.dataset.value;
    if (value === "SHARED" && !this.data.paired) { wx.showToast({ title: "配对后才能共同可见", icon: "none" }); return; }
    this.setData({ visibility: value });
  },
  async save() {
    if (this.data.saving) return;
    if (!this.data.body.trim() && !this.data.title.trim()) { this.setData({ error: "标题和正文至少填写一项。" }); return; }
    this.setData({ saving: true, error: "" });
    try {
      await appService.updateMoment(this.data.id, this.data.version, {
        title: this.data.title, body: this.data.body, occurredAt: this.data.occurredAt,
        visibility: this.data.visibility, mood: this.data.mood, events: this.data.selectedEvents
      });
      wx.showToast({ title: "修改已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 400);
    } catch (error) {
      if (!redirectExpiredSession()) {
        promptModerationAppeal(error, `编辑记录被拦截：${this.data.title || ""} ${this.data.body || ""}`, "MOMENT", this.data.id);
        this.setData({ error: userError(error, "保存失败，请刷新后重试。") });
      }
    } finally { this.setData({ saving: false }); }
  }
});
