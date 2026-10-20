import { store } from "../../core/store";
import { mediaCache } from "../../core/media-cache";
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
    customStart: "", customEnd: "", isRemote: appService.isRemote, partnerInitial: "TA", partnerAvatarUrl: "", summaryComplete: true,
    myAvatarUrl: "", myAvatarError: false, partnerAvatarError: false
  },
  remoteMoments: [] as any[],
  renderedMoments: [] as string[],
  syncVersion: "",
  pageScope: "",
  currentScope() { const state = store.getState(); return `${state.profile.id}:${state.couple.id}:${state.couple.status}:${state.loggedIn}`; },
  rangeRequestId: 0,
  mediaPollTimer: null as any,
  mediaPollCount: 0,
  visible: false,
  onShow() {
    const scope = this.currentScope();
    if (this.pageScope && this.pageScope !== scope) {
      this.remoteMoments = []; this.renderedMoments = []; this.syncVersion = "";
      this.setData({ moments: [], loaded: false, nextCursor: "", hasMore: false }); this.render();
    }
    this.pageScope = scope;
    this.visible = true;
    this.mediaPollCount = 0;
    clearTimeout(this.mediaPollTimer);
    const tab = this.getTabBar && this.getTabBar(); if (tab) tab.setData({ selected: 0 });
    if (appService.isRemote && appService.hasSession() && store.getState().loggedIn && !this.remoteMoments.length) {
      this.remoteMoments = store.getState().moments;
      this.render();
      this.setData({ loaded: this.remoteMoments.length > 0 });
    }
    return this.refresh(false);
  },
  onHide() { this.visible = false; this.rangeRequestId++; clearTimeout(this.mediaPollTimer); },
  onUnload() { this.onHide(); },
  onPullDownRefresh() { return this.refresh(); },
  onReachBottom() { this.loadMore(); },
  async refresh(force = true) {
    const requestId = ++this.rangeRequestId, manual = force !== false;
    if (manual || !this.data.loaded) this.setData({ loading: true, error: "" });
    try {
      const synced = await appService.refreshIfChanged(manual);
      if (requestId !== this.rangeRequestId) return;
      if (this.data.error) this.setData({ error: "" });
      if (!manual && this.data.loaded && this.syncVersion === synced.version) return;
      const timeline = synced.timeline;
      if (appService.isRemote && this.data.viewType === "day" && timeline) {
        if (!manual && this.remoteMoments.length > 50) await this.reloadTimelineRange(Math.ceil(this.remoteMoments.length / 50), requestId);
        else {
          this.remoteMoments = store.getState().moments;
          this.setData({ timelineFrom: timeline.from, timelineTo: timeline.to,
            nextCursor: timeline.nextCursor, hasMore: timeline.hasMore, summaryComplete: !timeline.hasMore });
          this.render();
        }
      }
      else if (appService.isRemote) await this.reloadTimelineRange(!manual ? Math.max(1, Math.ceil(this.remoteMoments.length / 50)) : 1, requestId);
      else this.render();
      if (requestId !== this.rangeRequestId) return;
      this.syncVersion = synced.version; this.setData({ loaded: true, error: "" });
      this.pageScope = this.currentScope();
    } catch (error) {
      if (requestId !== this.rangeRequestId) return;
      if (redirectExpiredSession()) return;
      if (appService.isRemote && !this.remoteMoments.length) this.remoteMoments = store.getState().moments;
      this.render();
      this.setData({ loaded: true, error: userError(error, "时光同步失败，当前展示最近一次保存的内容。") });
    } finally {
      if (requestId === this.rangeRequestId) {
        this.setData({ loading: false }); wx.stopPullDownRefresh(); this.scheduleMediaRefresh();
      }
    }
  },
  async loadMore() {
    if (!appService.isRemote || !this.data.hasMore || this.data.loadingMore) return;
    this.rangeRequestId++;
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
    } finally { this.setData({ loadingMore: false }); this.scheduleMediaRefresh(); }
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
  async reloadTimelineRange(pageCount = 1, requestToken?: number) {
    const requestId = requestToken ?? ++this.rangeRequestId;
    const range = this.timelineRange();
    const items: any[] = [];
    let page: any, cursor = "";
    for (let index = 0; index < pageCount; index++) {
      page = await appService.timelinePage(range.from, range.to, 50, cursor || undefined);
      if (requestId !== this.rangeRequestId) return;
      items.push(...page.items); cursor = page.next_cursor || "";
      if (!page.has_more || !cursor) break;
    }
    this.remoteMoments = items;
    store.appendRemoteMoments(items);
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
    const pending = this.remoteMoments.filter((moment: any) => moment.status === "UPLOADING"
      || (moment.status === "PUBLISHED" && moment.mediaType === "VIDEO" && moment.media?.some((media: any) => media.status === "READY" && !media.thumbnailPath)));
    if (!this.visible || !appService.isRemote || !appService.hasSession() || !pending.length || this.mediaPollCount >= 12) return;
    this.mediaPollTimer = setTimeout(async () => {
      if (!this.visible) return;
      if (this.data.loading || this.data.loadingMore) { this.scheduleMediaRefresh(); return; }
      this.mediaPollCount++;
      const requestId = this.rangeRequestId, state = store.getState();
      const owner = state.profile.id, coupleId = state.couple.id, status = state.couple.status;
      const current = () => this.visible && requestId === this.rangeRequestId && appService.hasSession()
        && owner === store.getState().profile.id && coupleId === store.getState().couple.id && status === store.getState().couple.status;
      for (const item of pending) {
        if (!current()) return;
        try {
          const moment = await appService.detail(item.id);
          if (!current()) return;
          if (!moment || !this.remoteMoments.includes(item)) continue;
          this.remoteMoments = this.remoteMoments.map(value => value.id === moment.id ? moment : value);
          const index = this.data.moments.findIndex(value => value.id === moment.id);
          if (moment.status === "DELETED" || moment.occurredAt !== item.occurredAt || moment.mood !== item.mood) this.render();
          else if (index >= 0) this.setData({ [`moments[${index}]`]: moment });
        } catch (error: any) {
          if (!current()) return;
          if (["RESOURCE_FORBIDDEN", "RESOURCE_NOT_FOUND"].includes(error?.code)) {
            store.removeRemoteMoment(item.id);
            this.remoteMoments = this.remoteMoments.filter(value => value.id !== item.id);
            this.render();
            await this.refresh(); return;
          }
          // 后台同步失败仍保留当前记录，用户可下拉重试。
        }
      }
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
    const myAvatarUrl = mediaCache.stableUrl(this.data.myAvatarUrl, state.profile.avatarUrl, this.data.myAvatarError);
    const partnerAvatarUrl = mediaCache.stableUrl(this.data.partnerAvatarUrl, state.couple.partnerAvatarUrl, this.data.partnerAvatarError);
    const rendered = filtered.map(item => JSON.stringify(item));
    const patch: Record<string, any> = {};
    if (filtered.length !== this.data.moments.length || filtered.some((item, index) => item.id !== this.data.moments[index]?.id)) patch.moments = filtered;
    else filtered.forEach((item, index) => {
      if (rendered[index] !== this.renderedMoments[index]) patch[`moments[${index}]`] = item;
    });
    this.renderedMoments = rendered;
    this.setData({
      ...patch, profile: state.profile, couple: state.couple,
      myAvatarError: this.data.myAvatarUrl === myAvatarUrl && this.data.myAvatarError,
      ...(myAvatarUrl !== this.data.myAvatarUrl ? { myAvatarUrl } : {}),
      partnerAvatarError: this.data.partnerAvatarUrl === partnerAvatarUrl && this.data.partnerAvatarError,
      unread: state.messages.filter((item) => !item.read).length,
      weekDays: this.buildWeek(now, moments), calendar: this.buildCalendar(now, moments), months: this.buildMonths(now, moments),
      dateEyebrow: `${now.getFullYear()}年${now.getMonth() + 1}月${now.getDate()}日 · 星期${"日一二三四五六"[now.getDay()]}`,
      currentDateLabel: `${now.getMonth() + 1} 月 ${now.getDate()} 日`, currentYear: now.getFullYear(),
      currentMonthTitle: `${now.getFullYear()} 年 ${now.getMonth() + 1} 月`, customStart, customEnd,
      partnerInitial: (state.couple.partnerName || "TA").slice(0, 1),
      ...(partnerAvatarUrl !== this.data.partnerAvatarUrl ? { partnerAvatarUrl } : {})
    });
  },
  dateValue(date: Date) { const month = `${date.getMonth() + 1}`.padStart(2, "0"); const day = `${date.getDate()}`.padStart(2, "0"); return `${date.getFullYear()}-${month}-${day}`; },
  avatarError(event: any) { this.setData({ [event.currentTarget.dataset.avatar === "my" ? "myAvatarError" : "partnerAvatarError"]: true }); },
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
