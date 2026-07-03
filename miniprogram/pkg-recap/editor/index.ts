import { store } from "../../core/store";
import { decorateMoment } from "../../core/format";
Page({
  data: { title: "", candidates: [] as any[], excludedCount: 0, selectedIds: [] as string[] },
  onLoad() { const state = store.getState(); const allShared = state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED"); const sensitive = ["争执","委屈","生气","第一次"]; const selectedIds = state.recap.selectedMomentIds; const candidates = allShared.filter((item) => !sensitive.includes(item.mood) && !item.events.some((tag) => sensitive.includes(tag))).map((item) => ({ ...decorateMoment(item), selected: selectedIds.includes(item.id) })); this.setData({ title: state.recap.title, candidates, excludedCount: allShared.length - candidates.length, selectedIds: selectedIds.filter((id) => candidates.some((item) => item.id === id)) }); },
  titleInput(event: any) { this.setData({ title: event.detail.value }); },
  toggle(event: any) { const id = event.currentTarget.dataset.id; const selectedIds = [...this.data.selectedIds]; const index = selectedIds.indexOf(id); if (index >= 0) selectedIds.splice(index, 1); else selectedIds.push(id); this.setData({ selectedIds, candidates: this.data.candidates.map((item: any) => ({ ...item, selected: selectedIds.includes(item.id) })) }); },
  preview() { if (!this.data.selectedIds.length) { wx.showToast({ title: "请至少选择一个片段", icon: "none" }); return; } store.updateRecap(this.data.title.trim() || "我们的 2026", this.data.selectedIds); wx.navigateTo({ url: "/pkg-recap/preview/index" }); }
});
