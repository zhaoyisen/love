import { store } from "../../core/store";
import { appService, redirectExpiredSession, userError } from "../../services/app-service";

const PET_KINDS = ["云朵猫", "奶油狗", "小熊"];

Page({
  data: {
    pet: {} as any,
    paired: false,
    loading: false,
    acting: false,
    saving: false,
    error: "",
    petKinds: PET_KINDS,
    selectedKind: PET_KINDS[0],
    adoptionName: "团子",
    renameOpen: false,
    renameName: ""
  },
  async onShow() { await this.refresh(); },
  async refresh() {
    this.setData({ loading: appService.isRemote, error: "" });
    try {
      if (appService.isRemote) await appService.pet();
      this.render();
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "宠物状态暂时没有同步成功，请稍后重试。") });
      this.render();
    } finally {
      this.setData({ loading: false });
    }
  },
  render() {
    const state = store.getState();
    const pet = state.pet;
    this.setData({
      pet,
      paired: state.couple.status === "PAIRED",
      selectedKind: pet.adoption?.kind || this.data.selectedKind,
      adoptionName: pet.adoption?.name || this.data.adoptionName,
      renameName: this.data.renameOpen ? this.data.renameName : pet.name
    });
  },
  selectKind(event: any) { this.setData({ selectedKind: event.currentTarget.dataset.kind }); },
  inputAdoptionName(event: any) { this.setData({ adoptionName: event.detail.value }); },
  inputRenameName(event: any) { this.setData({ renameName: event.detail.value }); },
  async proposeAdoption() {
    if (!this.data.paired || this.data.saving) return;
    const name = this.data.adoptionName.trim();
    if (!name) return wx.showToast({ title: "先给小伙伴起个名字", icon: "none" });
    this.setData({ saving: true, error: "" });
    try {
      await appService.proposePetAdoption(this.data.selectedKind, name);
      this.render();
      wx.showToast({ title: "已发给 TA 确认", icon: "success" });
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "领养提议没有保存，请稍后再试。"), icon: "none" });
    } finally { this.setData({ saving: false }); }
  },
  async confirmAdoption() {
    if (this.data.saving) return;
    this.setData({ saving: true, error: "" });
    try {
      await appService.confirmPetAdoption();
      this.render();
      wx.showToast({ title: "领养成功", icon: "success" });
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "确认没有完成，请稍后再试。"), icon: "none" });
    } finally { this.setData({ saving: false }); }
  },
  openRename() { this.setData({ renameOpen: true, renameName: this.data.pet.name || "" }); },
  closeRename() { this.setData({ renameOpen: false }); },
  async rename() {
    const name = this.data.renameName.trim();
    if (!name || this.data.saving) return wx.showToast({ title: "请输入新名字", icon: "none" });
    this.setData({ saving: true, error: "" });
    try {
      await appService.renamePet(name);
      this.setData({ renameOpen: false });
      this.render();
      wx.showToast({ title: "新名字已保存", icon: "success" });
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "改名没有完成，请稍后再试。"), icon: "none" });
    } finally { this.setData({ saving: false }); }
  },
  async action(event: any) {
    if (!this.data.paired || this.data.acting) return;
    this.setData({ acting: true, error: "" });
    try {
      const result = await appService.petAction(event.currentTarget.dataset.action);
      this.render();
      wx.showToast({ title: result.changed ? `小伙伴很开心 +${result.growthDelta || 8}` : "今天已经做过啦", icon: "none" });
    } catch (error) {
      if (!redirectExpiredSession()) wx.showToast({ title: userError(error, "互动没有完成，请稍后再试。"), icon: "none" });
    } finally { this.setData({ acting: false }); }
  }
});
