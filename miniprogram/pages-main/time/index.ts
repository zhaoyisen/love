import { store } from "../../core/store";
import type { ViewType } from "../../core/types";

const labels: Record<ViewType, string> = { day: "天", week: "周", month: "月", year: "年", custom: "自定义" };

Page({
  data: {
    profile: {}, couple: {}, moments: [] as any[], viewType: "day" as ViewType,
    views: Object.keys(labels).map((key) => ({ key, label: labels[key as ViewType] })),
    weekDays: [], calendar: [], months: [], showFilter: false, filterMood: "全部", unread: 0
  },
  onShow() {
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 0 });
    this.refresh();
  },
  refresh() {
    const state = store.getState();
    const moments = state.moments.filter((item) => item.status !== "DELETED" && (state.couple.status === "PAIRED" || item.author === "我"));
    const filtered = this.data.filterMood === "全部" ? moments : moments.filter((item) => item.mood === this.data.filterMood);
    this.setData({ profile: state.profile, couple: state.couple, moments: filtered, unread: state.messages.filter((item) => !item.read).length, weekDays: this.buildWeek(), calendar: this.buildCalendar(moments), months: this.buildMonths(moments) });
  },
  buildWeek() {
    return [
      { label: "一", day: 29, count: 0 }, { label: "二", day: 30, count: 1 }, { label: "三", day: 1, count: 0 },
      { label: "四", day: 2, count: 1, active: true }, { label: "五", day: 3, count: 0 }, { label: "六", day: 4, count: 0 }, { label: "日", day: 5, count: 0 }
    ];
  },
  buildCalendar(moments: any[]) {
    const days: any[] = [];
    for (let index = 0; index < 35; index += 1) {
      const day = index < 2 ? 29 + index : index - 1;
      const muted = index < 2 || day > 31;
      days.push({ day: day > 31 ? day - 31 : day, muted, active: day === 2 && !muted, count: moments.some((item) => new Date(item.occurredAt).getDate() === day) ? 1 : 0 });
    }
    return days;
  },
  buildMonths(moments: any[]) {
    return ["一月","二月","三月","四月","五月","六月","七月","八月","九月","十月","十一月","十二月"].map((label, index) => ({ label, count: moments.filter((item) => new Date(item.occurredAt).getMonth() === index).length, active: index === 6 }));
  },
  switchView(event: any) { this.setData({ viewType: event.currentTarget.dataset.view }); },
  toggleFilter() { this.setData({ showFilter: !this.data.showFilter }); },
  filterMood(event: any) { this.setData({ filterMood: event.currentTarget.dataset.value, showFilter: false }); this.refresh(); },
  openMoment(event: any) { wx.navigateTo({ url: `/pkg-moment/detail/index?id=${event.detail.id}` }); },
  compose() { wx.navigateTo({ url: "/pkg-compose/composer/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); }
});
