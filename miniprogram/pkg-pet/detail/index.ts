import { store } from "../../core/store";
Page({
  data: { pet: {} as any, paired: false },
  onShow() { const state = store.getState(); this.setData({ pet: state.pet, paired: state.couple.status === "PAIRED" }); },
  action(event: any) { if (!this.data.paired) return; const changed = store.petAction(event.currentTarget.dataset.action); wx.showToast({ title: changed ? "团子很开心 +8" : "今天已经做过啦", icon: "none" }); this.onShow(); }
});
