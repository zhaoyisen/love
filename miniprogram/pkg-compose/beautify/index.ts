import { store } from "../../core/store";

Page({
  data: {
    draftId: "", draft: {} as any, selected: "奶油胶片", showDate: true, showCopy: true,
    templates: [
      { name: "奶油胶片", color: "cream", mark: "FILM 01" }, { name: "草莓手账", color: "berry", mark: "SWEET" },
      { name: "月光蓝", color: "moon", mark: "MOON" }, { name: "复古拍立得", color: "retro", mark: "MEMO" },
      { name: "旅行邮票", color: "travel", mark: "TRIP" }, { name: "极简纪念", color: "minimal", mark: "2026" }
    ]
  },
  onLoad(query: any) { const draft = store.getDraft(query.draftId); if (!draft) { wx.navigateBack(); return; } this.setData({ draftId: draft.id, draft, selected: draft.template }); },
  select(event: any) { const selected = event.currentTarget.dataset.name; this.setData({ selected }); store.saveDraft(this.data.draftId, { template: selected }); },
  toggleDate() { this.setData({ showDate: !this.data.showDate }); },
  toggleCopy() { this.setData({ showCopy: !this.data.showCopy }); },
  reset() { this.setData({ selected: "原始照片" }); store.saveDraft(this.data.draftId, { template: "原始照片" }); },
  done() { wx.showToast({ title: "模板已保存", icon: "success" }); setTimeout(() => wx.navigateBack(), 500); }
});
