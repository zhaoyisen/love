import { store } from "../../core/store";
import type { ViewType } from "../../core/types";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

const labels: Record<ViewType, string> = { day: "天", week: "周", month: "月", year: "年", custom: "自定义" };

Page({
  data: {
    profile: {}, couple: {}, moments: [] as any[], viewType: "day" as ViewType,
    views: Object.keys(labels).map((key) => ({ key, label: labels[key as ViewType] })),
    weekDays: [], calendar: [], months: [], showFilter: false, filterMood: "全部", unread: 0,
    loading: false, loaded: false, error: "", dateEyebrow: "", currentDateLabel: "", currentYear: 0, currentMonthTitle: "",
    customStart: "", customEnd: ""
  },
  onShow() {
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 0 });
    this.refresh();
  },
  onPullDownRefresh() { this.refresh(); },
  async refresh() {
    this.setData({ loading: true, error: "" });
    try {
      await appService.refresh();
      this.render();
      this.setData({ loaded: true });
    } catch (error) {
      if (redirectExpiredSession()) return;
      this.render();
      this.setData({ loaded: true, error: userError(error, "时光同步失败，当前展示最近一次保存的内容。") });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
    }
  },
  render() {
    const state = store.getState();
    const moments = state.moments.filter((item) => item.status !== "DELETED" && (state.couple.status === "PAIRED" || item.author === "我"));
    const now = new Date();
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const customStart = this.data.customStart || this.dateValue(thirtyDaysAgo);
    const customEnd = this.data.customEnd || this.dateValue(now);
    const ranged = this.data.viewType === "custom"
      ? moments.filter((item) => { const date = this.dateValue(new Date(item.occurredAt)); return date >= customStart && date <= customEnd; })
      : moments;
    const filtered = this.data.filterMood === "全部" ? ranged : ranged.filter((item) => item.mood === this.data.filterMood);
    this.setData({
      profile: state.profile, couple: state.couple, moments: filtered,
      unread: state.messages.filter((item) => !item.read).length,
      weekDays: this.buildWeek(now, moments), calendar: this.buildCalendar(now, moments), months: this.buildMonths(now, moments),
      dateEyebrow: `${now.getFullYear()} · ${now.getMonth() + 1}月`,
      currentDateLabel: `${now.getMonth() + 1} 月 ${now.getDate()} 日`, currentYear: now.getFullYear(),
      currentMonthTitle: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`, customStart, customEnd
    });
  },
  dateValue(date: Date) { const month = `${date.getMonth() + 1}`.padStart(2, "0"); const day = `${date.getDate()}`.padStart(2, "0"); return `${date.getFullYear()}-${month}-${day}`; },
  buildWeek(now: Date, moments: any[]) {
    const labels = ["一", "二", "三", "四", "五", "六", "日"];
    const monday = new Date(now); monday.setHours(0, 0, 0, 0); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
    return labels.map((label, index) => {
      const date = new Date(monday); date.setDate(monday.getDate() + index);
      const count = moments.filter((item) => new Date(item.occurredAt).toDateString() === date.toDateString()).length;
      return { label, day: date.getDate(), count, active: date.toDateString() === now.toDateString() };
    });
  },
  buildCalendar(now: Date, moments: any[]) {
    const days: any[] = [];
    const first = new Date(now.getFullYear(), now.getMonth(), 1);
    const start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));
    for (let index = 0; index < 42; index += 1) {
      const date = new Date(start); date.setDate(start.getDate() + index);
      const count = moments.filter((item) => new Date(item.occurredAt).toDateString() === date.toDateString()).length;
      days.push({ day: date.getDate(), muted: date.getMonth() !== now.getMonth(), active: date.toDateString() === now.toDateString(), count });
    }
    return days;
  },
  buildMonths(now: Date, moments: any[]) {
    return ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"].map((label, index) => ({ label, count: moments.filter((item) => { const date = new Date(item.occurredAt); return date.getFullYear() === now.getFullYear() && date.getMonth() === index; }).length, active: index === now.getMonth() }));
  },
  switchView(event: any) { this.setData({ viewType: event.currentTarget.dataset.view }); this.render(); },
  customStartChange(event: any) { const customStart = event.detail.value; if (customStart > this.data.customEnd) { wx.showToast({ title: "开始日期不能晚于结束日期", icon: "none" }); return; } this.setData({ customStart }); this.render(); },
  customEndChange(event: any) { const customEnd = event.detail.value; if (customEnd < this.data.customStart) { wx.showToast({ title: "结束日期不能早于开始日期", icon: "none" }); return; } this.setData({ customEnd }); this.render(); },
  toggleFilter() { this.setData({ showFilter: !this.data.showFilter }); },
  filterMood(event: any) { this.setData({ filterMood: event.currentTarget.dataset.value, showFilter: false }); this.render(); },
  openMoment(event: any) { wx.navigateTo({ url: `/pkg-moment/detail/index?id=${event.detail.id}` }); },
  compose() { wx.navigateTo({ url: "/pkg-compose/composer/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); }
});
