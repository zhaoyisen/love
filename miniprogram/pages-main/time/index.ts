import { store } from "../../core/store";
import type { ViewType } from "../../core/types";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

const labels: Record<ViewType, string> = { day: "最新", week: "本周", month: "本月", year: "今年", custom: "自定义" };

Page({
  data: {
    profile: {}, couple: {}, moments: [] as any[], viewType: "day" as ViewType,
    views: Object.keys(labels).map((key) => ({ key, label: labels[key as ViewType] })),
    weekDays: [], calendar: [], months: [], showFilter: false, filterMood: "全部", unread: 0,
    loading: false, loadingMore: false, loaded: false, error: "", dateEyebrow: "", currentDateLabel: "", currentYear: 0, currentMonthTitle: "",
    nextCursor: "", hasMore: false, timelineFrom: "", timelineTo: "",
    customStart: "", customEnd: "", isRemote: appService.isRemote, partnerInitial: "TA", partnerAvatarUrl: "", summaryComplete: true
  },
  remoteMoments: [] as any[],
  rangeRequestId: 0,
  mediaPollTimer: null as any,
  mediaPollCount: 0,
  visible: false,
  onShow() {
    this.visible = true;
    this.mediaPollCount = 0;
    clearTimeout(this.mediaPollTimer);
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 0 });
    if (appService.isRemote && appService.hasSession() && store.getState().loggedIn && !this.remoteMoments.length) {
      this.remoteMoments = store.getState().moments;
      this.render();
      this.setData({ loaded: this.remoteMoments.length > 0 });
    }
    this.refresh();
  },
  onHide() { this.visible = false; clearTimeout(this.mediaPollTimer); },
  onUnload() { this.visible = false; clearTimeout(this.mediaPollTimer); },
  onPullDownRefresh() { this.refresh(); },
  onReachBottom() { this.loadMore(); },
  async refresh() {
    this.setData({ loading: true, error: "" });
    try {
      const timeline = await appService.refresh();
      if (appService.isRemote && this.data.viewType === "day" && timeline) {
        // 首次同步已取回“最新”列表，复用结果，避免再发一次相同的时间线请求。
        this.remoteMoments = store.getState().moments;
        this.setData({ timelineFrom: timeline.from, timelineTo: timeline.to, nextCursor: timeline.nextCursor,
          hasMore: timeline.hasMore, summaryComplete: !timeline.hasMore });
        this.render();
      }
      else if (appService.isRemote) await this.reloadTimelineRange();
      else this.render();
      this.setData({ loaded: true });
    } catch (error) {
      if (redirectExpiredSession()) return;
      if (appService.isRemote && !this.remoteMoments.length) this.remoteMoments = store.getState().moments;
      this.render();
      this.setData({ loaded: true, error: userError(error, "时光同步失败，当前展示最近一次保存的内容。") });
    } finally {
      this.setData({ loading: false });
      wx.stopPullDownRefresh();
      this.scheduleMediaRefresh();
    }
  },
  async loadMore() {
    if (!appService.isRemote || !this.data.hasMore || this.data.loadingMore) return;
    this.setData({ loadingMore: true });
    try {
      const page = await appService.timelinePage(this.data.timelineFrom, this.data.timelineTo, 50, this.data.nextCursor);
      store.appendRemoteMoments(page.items);
      const incoming = new Set(page.items.map((item: any) => item.id));
      this.remoteMoments = [...this.remoteMoments.filter((item: any) => !incoming.has(item.id)), ...page.items];
      this.setData({ nextCursor: page.next_cursor || "", hasMore: Boolean(page.has_more), summaryComplete: !page.has_more });
      this.render();
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "更多记录加载失败"), icon: "none" });
    } finally { this.setData({ loadingMore: false }); }
  },
  timelineRange() {
    const now = new Date();
    const from = new Date(now);
    const to = new Date(now.getTime() + 5 * 60000);
    if (this.data.viewType === "day") {
      from.setTime(new Date("2000-01-01T00:00:00.000Z").getTime());
    } else if (this.data.viewType === "week") {
      from.setHours(0, 0, 0, 0); from.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      to.setTime(from.getTime()); to.setDate(from.getDate() + 6); to.setHours(23, 59, 59, 999);
    } else if (this.data.viewType === "month") {
      from.setFullYear(now.getFullYear(), now.getMonth(), 1); from.setHours(0, 0, 0, 0);
      to.setFullYear(now.getFullYear(), now.getMonth() + 1, 0); to.setHours(23, 59, 59, 999);
    } else if (this.data.viewType === "year") {
      from.setFullYear(now.getFullYear(), 0, 1); from.setHours(0, 0, 0, 0);
      to.setFullYear(now.getFullYear(), 11, 31); to.setHours(23, 59, 59, 999);
    } else {
      const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
      const start = this.data.customStart || this.dateValue(thirtyDaysAgo);
      const end = this.data.customEnd || this.dateValue(now);
      from.setTime(new Date(`${start}T00:00:00`).getTime());
      to.setTime(new Date(`${end}T23:59:59.999`).getTime());
    }
    return { from: from.toISOString(), to: to.toISOString() };
  },
  async reloadTimelineRange() {
    const requestId = ++this.rangeRequestId;
    const range = this.timelineRange();
    const page = await appService.timelinePage(range.from, range.to, 50);
    if (requestId !== this.rangeRequestId) return;
    this.remoteMoments = page.items;
    store.appendRemoteMoments(page.items);
    this.setData({
      timelineFrom: range.from,
      timelineTo: range.to,
      nextCursor: page.next_cursor || "",
      hasMore: Boolean(page.has_more),
      summaryComplete: !page.has_more
    });
    this.render();
  },
  scheduleMediaRefresh() {
    clearTimeout(this.mediaPollTimer);
    const pending = this.remoteMoments.some((moment: any) => moment.status === "UPLOADING"
      || (moment.status === "PUBLISHED" && moment.media?.some((media: any) => media.status === "READY" && !media.thumbnailPath)));
    if (!this.visible || !appService.isRemote || !appService.hasSession() || !pending || this.mediaPollCount >= 12) return;
    this.mediaPollTimer = setTimeout(async () => {
      if (!this.visible) return;
      if (this.data.loading || this.data.loadingMore) { this.scheduleMediaRefresh(); return; }
      this.mediaPollCount++;
      try { await this.reloadTimelineRange(); } catch (_) { /* 后台同步失败仍保留当前记录，用户可下拉重试。 */ }
      this.scheduleMediaRefresh();
    }, 5000);
  },
  render() {
    const state = store.getState();
    const source = appService.isRemote ? this.remoteMoments : state.moments;
    const moments = source.filter((item) => item.status !== "DELETED" && (state.couple.status === "PAIRED" || item.author === "我"));
    const now = new Date();
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(now.getDate() - 30);
    const customStart = this.data.customStart || this.dateValue(thirtyDaysAgo);
    const customEnd = this.data.customEnd || this.dateValue(now);
    const rangeStart = new Date(now);
    const rangeEnd = new Date(now);
    if (this.data.viewType === "day") {
      rangeStart.setHours(0, 0, 0, 0); rangeEnd.setHours(23, 59, 59, 999);
    } else if (this.data.viewType === "week") {
      rangeStart.setHours(0, 0, 0, 0); rangeStart.setDate(now.getDate() - ((now.getDay() + 6) % 7));
      rangeEnd.setTime(rangeStart.getTime()); rangeEnd.setDate(rangeStart.getDate() + 6); rangeEnd.setHours(23, 59, 59, 999);
    } else if (this.data.viewType === "month") {
      rangeStart.setFullYear(now.getFullYear(), now.getMonth(), 1); rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setFullYear(now.getFullYear(), now.getMonth() + 1, 0); rangeEnd.setHours(23, 59, 59, 999);
    } else if (this.data.viewType === "year") {
      rangeStart.setFullYear(now.getFullYear(), 0, 1); rangeStart.setHours(0, 0, 0, 0);
      rangeEnd.setFullYear(now.getFullYear(), 11, 31); rangeEnd.setHours(23, 59, 59, 999);
    } else {
      rangeStart.setTime(new Date(`${customStart}T00:00:00`).getTime());
      rangeEnd.setTime(new Date(`${customEnd}T23:59:59.999`).getTime());
    }
    const ranged = this.data.viewType === "day" ? moments : moments.filter((item) => { const occurredAt = new Date(item.occurredAt).getTime(); return occurredAt >= rangeStart.getTime() && occurredAt <= rangeEnd.getTime(); });
    const filtered = this.data.filterMood === "全部" ? ranged : ranged.filter((item) => item.mood === this.data.filterMood);
    this.setData({
      profile: state.profile, couple: state.couple, moments: filtered,
      unread: state.messages.filter((item) => !item.read).length,
      weekDays: this.buildWeek(now, moments), calendar: this.buildCalendar(now, moments), months: this.buildMonths(now, moments),
      dateEyebrow: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${"日一二三四五六"[now.getDay()]}`,
      currentDateLabel: `${now.getMonth() + 1} 月 ${now.getDate()} 日`, currentYear: now.getFullYear(),
      currentMonthTitle: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`, customStart, customEnd,
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1), partnerAvatarUrl: state.couple.partnerAvatarUrl || ""
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
  async switchView(event: any) {
    const viewType = event.currentTarget.dataset.view;
    if (viewType === this.data.viewType) return;
    this.setData({ viewType, loading: appService.isRemote, error: "" });
    try { if (appService.isRemote) await this.reloadTimelineRange(); else this.render(); }
    catch (error) { this.setData({ error: userError(error, "这段时光没有加载完成，请重试。") }); }
    finally { this.setData({ loading: false }); }
  },
  async customStartChange(event: any) { const customStart = event.detail.value; if (customStart > this.data.customEnd) { wx.showToast({ title: "开始日期不能晚于结束日期", icon: "none" }); return; } this.setData({ customStart, loading: appService.isRemote, error: "" }); try { if (appService.isRemote) await this.reloadTimelineRange(); else this.render(); } catch (error) { this.setData({ error: userError(error, "自定义时间范围加载失败，请重试。") }); } finally { this.setData({ loading: false }); } },
  async customEndChange(event: any) { const customEnd = event.detail.value; if (customEnd < this.data.customStart) { wx.showToast({ title: "结束日期不能早于开始日期", icon: "none" }); return; } this.setData({ customEnd, loading: appService.isRemote, error: "" }); try { if (appService.isRemote) await this.reloadTimelineRange(); else this.render(); } catch (error) { this.setData({ error: userError(error, "自定义时间范围加载失败，请重试。") }); } finally { this.setData({ loading: false }); } },
  toggleFilter() { this.setData({ showFilter: !this.data.showFilter }); },
  filterMood(event: any) { this.setData({ filterMood: event.currentTarget.dataset.value, showFilter: false }); this.render(); },
  emptyAction() {
    if (this.data.filterMood !== "全部") {
      this.setData({ filterMood: "全部", showFilter: false });
      this.render();
      return;
    }
    this.compose();
  },
  openMoment(event: any) { wx.navigateTo({ url: `/pkg-moment/detail/index?id=${event.detail.id}` }); },
  compose() { wx.navigateTo({ url: "/pkg-compose/composer/index" }); },
  messages() { wx.navigateTo({ url: "/pkg-couple/messages/index" }); }
});
