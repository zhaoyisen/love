import { store } from "../../core/store";
import { decorateMoment } from "../../core/format";
import { appService, promptModerationAppeal, redirectExpiredSession, userError } from "../../services/app-service";
Page({
  data: { title: "", candidates: [] as any[], excludedCount: 0, selectedIds: [] as string[], loading: false, saving: false, error: "" },
  async onLoad() { await this.load(); },
  async load() {
    this.setData({ loading: appService.isRemote, error: "" });
    try {
      if (appService.isRemote) {
        const result = await appService.recapCandidates(store.getState().recap.year || new Date().getFullYear());
        this.setData({ excludedCount: result.excludedCount });
      }
      this.render();
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "候选片段同步失败，请稍后重试。") });
      this.render();
    } finally {
      this.setData({ loading: false });
    }
  },
  render() { const state = store.getState(); const allShared = state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED"); const sensitive = ["争执","委屈","生气","第一次"]; const selectedIds = state.recap.selectedMomentIds; const candidates = allShared.filter((item) => !sensitive.includes(item.mood) && !item.events.some((tag) => sensitive.includes(tag))).map((item) => ({ ...decorateMoment(item), selected: selectedIds.includes(item.id) })); this.setData({ title: state.recap.title, candidates, excludedCount: appService.isRemote ? this.data.excludedCount : allShared.length - candidates.length, selectedIds: selectedIds.filter((id) => candidates.some((item) => item.id === id)) }); },
  titleInput(event: any) { this.setData({ title: event.detail.value }); },
  toggle(event: any) { const id = event.currentTarget.dataset.id; const selectedIds = [...this.data.selectedIds]; const index = selectedIds.indexOf(id); if (index >= 0) selectedIds.splice(index, 1); else selectedIds.push(id); this.setData({ selectedIds, candidates: this.data.candidates.map((item: any) => ({ ...item, selected: selectedIds.includes(item.id) })) }); },
  async preview() { if (!this.data.selectedIds.length) { wx.showToast({ title: "请至少选择一个片段", icon: "none" }); return; } this.setData({ saving: true }); try { await appService.updateRecap(this.data.title.trim() || "我们的 2026", this.data.selectedIds, store.getState().recap.year || new Date().getFullYear()); wx.navigateTo({ url: "/pkg-recap/preview/index" }); } catch (error) { if (!redirectExpiredSession()) { promptModerationAppeal(error, `年度回顾草稿被拦截：${this.data.title || ""}`, "RECAP", null); wx.showToast({ title: userError(error, "回顾草稿没有保存，请稍后重试。"), icon: "none" }); } } finally { this.setData({ saving: false }); } }
});
