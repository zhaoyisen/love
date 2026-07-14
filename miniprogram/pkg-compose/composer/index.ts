import { store } from "../../core/store";
import type { Draft, MediaType } from "../../core/types";
import { appService } from "../../services/app-service";

let saveTimer: any;
let discardOnUnload = false;
let originalDraft: Draft | undefined;

function selectedFileSize(path: string, provided: any) {
  if (Number(provided) > 0) return Number(provided);
  try { return Number(wx.getFileSystemManager().statSync(path).size || 0); }
  catch (_) { return 0; }
}

Page({
  data: {
    draftId: "", step: 1, draft: {} as Draft, paired: false, savedText: "已自动保存",
    remoteUploadEnabled: appService.isRemote,
    mediaTypes: [
      { key: "IMAGE", label: "照片", note: "1–9 张", available: true },
      { key: "VIDEO", label: "视频", note: "1 段", available: true },
      { key: "TEXT", label: "文字", note: "安静写下", available: true }
    ],
    moods: ["开心","心动","平静","想念","委屈","生气","和好","其他"],
    eventOptions: ["日常","约会","旅行","纪念日","第一次","争执","和好","礼物","共同成长","其他"].map((value) => ({ value, active: value === "日常" })),
    bodyLeft: 1000, titleLeft: 30, today: "", selectedDate: ""
  },
  onLoad(query: any) {
    discardOnUnload = false;
    const existing = query.draftId ? store.getDraft(query.draftId) : undefined;
    const draft = existing || store.createDraft("IMAGE");
    originalDraft = JSON.parse(JSON.stringify(draft));
    this.setData({ draftId: draft.id, draft, step: draft.step, paired: store.getState().couple.status === "PAIRED", bodyLeft: 1000 - draft.body.length, titleLeft: 30 - draft.title.length, today: this.dateValue(new Date()), selectedDate: this.dateValue(new Date(draft.occurredAt)), eventOptions: this.data.eventOptions.map((item: any) => ({ ...item, active: draft.events.includes(item.value) })) });
  },
  onUnload() { clearTimeout(saveTimer); if (!discardOnUnload) this.persistNow(); },
  dateValue(date: Date) { const m = `${date.getMonth()+1}`.padStart(2,"0"); const d = `${date.getDate()}`.padStart(2,"0"); return `${date.getFullYear()}-${m}-${d}`; },
  patchDraft(patch: Partial<Draft>) {
    const draft = { ...this.data.draft, ...patch };
    this.setData({ draft, savedText: "正在保存…" });
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => { store.saveDraft(this.data.draftId, patch); this.setData({ savedText: "已自动保存" }); }, 3000);
  },
  persistNow() { if (this.data.draftId && this.data.draft.id) store.saveDraft(this.data.draftId, this.data.draft); },
  selectType(event: any) {
    const mediaType = event.currentTarget.dataset.type as MediaType;
    if (mediaType === this.data.draft.mediaType) return;
    const apply = () => {
      this.patchDraft({ mediaType, media: [] });
      if (mediaType === "TEXT") this.setData({ step: 2 });
    };
    if (this.data.draft.media.length) {
      wx.showModal({ title: "更换记录形式？", content: "更换后，当前已选择的媒体会被移除。", confirmText: "确认更换", success: (res: any) => { if (res.confirm) apply(); } });
      return;
    }
    apply();
  },
  async chooseMedia() {
    const mediaType = this.data.draft.mediaType;
    const limit = mediaType === "VIDEO" ? 1 : 9;
    if (this.data.draft.media.length >= limit) { wx.showToast({ title: mediaType === "VIDEO" ? "每条记录只能添加一个视频" : "照片最多添加 9 张", icon: "none" }); return; }
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const remaining = limit - this.data.draft.media.length;
        if (mediaType === "VIDEO" && wx.chooseVideo) wx.chooseVideo({ sourceType: ["album", "camera"], compressed: true, success: (res: any) => resolve({ tempFiles: [{ tempFilePath: res.tempFilePath, fileType: "video", size: res.size }] }), fail: reject });
        else if (wx.chooseMedia) wx.chooseMedia({ count: remaining, mediaType: ["image"], sourceType: ["album", "camera"], success: resolve, fail: reject });
        else wx.chooseImage({ count: remaining, success: (res: any) => resolve({ tempFiles: res.tempFilePaths.map((path: string) => ({ tempFilePath: path, fileType: "image" })) }), fail: reject });
      });
      const media = result.tempFiles.map((file: any, index: number) => {
        const path = file.tempFilePath || file.path;
        const extension = String(path || "").split(".").pop()?.toLowerCase();
        const mimeType = mediaType === "VIDEO"
          ? (extension === "mov" ? "video/quicktime" : "video/mp4")
          : (extension === "png" ? "image/png" : extension === "webp" ? "image/webp" : "image/jpeg");
        return {
          id: `local_${Date.now()}_${index}`,
          type: mediaType,
          path,
          fileName: String(path || `memory_${index}`).split("/").pop() || `memory_${index}`,
          mimeType,
          size: selectedFileSize(path, file.size),
          progress: 100,
          status: "READY"
        };
      });
      this.patchDraft({ media: [...this.data.draft.media, ...media].slice(0, limit) });
    } catch (_) { /* user cancelled */ }
  },
  removeMedia(event: any) { const index = Number(event.currentTarget.dataset.index); const media = this.data.draft.media.filter((_: any, i: number) => i !== index); this.patchDraft({ media }); },
  titleInput(event: any) { const title = event.detail.value; this.setData({ titleLeft: 30 - title.length }); this.patchDraft({ title }); },
  bodyInput(event: any) { const body = event.detail.value; this.setData({ bodyLeft: 1000 - body.length }); this.patchDraft({ body }); },
  selectMood(event: any) { this.patchDraft({ mood: event.currentTarget.dataset.value }); },
  toggleEvent(event: any) {
    const value = event.currentTarget.dataset.value;
    const events = [...this.data.draft.events]; const index = events.indexOf(value);
    if (index >= 0) events.splice(index, 1); else if (events.length < 3) events.push(value); else { wx.showToast({ title: "事件标签最多选 3 个", icon: "none" }); return; }
    this.setData({ eventOptions: this.data.eventOptions.map((item: any) => ({ ...item, active: events.includes(item.value) })) });
    this.patchDraft({ events });
  },
  dateChange(event: any) {
    const selectedDate = event.detail.value; const current = new Date(this.data.draft.occurredAt); const [year, month, day] = selectedDate.split("-").map(Number);
    current.setFullYear(year, month - 1, day); this.setData({ selectedDate }); this.patchDraft({ occurredAt: current.toISOString() });
  },
  visibility(event: any) {
    const value = event.currentTarget.dataset.value;
    if (value === "SHARED" && !this.data.paired) { wx.showToast({ title: "配对后才能共同可见", icon: "none" }); return; }
    this.patchDraft({ visibility: value });
  },
  next() {
    if (this.data.step === 1 && this.data.draft.mediaType !== "TEXT" && !this.data.draft.media.length) { wx.showToast({ title: "请先选择媒体，或改用纯文字", icon: "none" }); return; }
    const step = Math.min(2, this.data.step + 1); this.setData({ step }); this.patchDraft({ step });
  },
  previous() { const step = Math.max(1, this.data.step - 1); this.setData({ step }); this.patchDraft({ step }); },
  beautify() { this.persistNow(); wx.navigateTo({ url: `/pkg-compose/beautify/index?draftId=${this.data.draftId}` }); },
  preview() {
    if (this.data.draft.mediaType !== "TEXT" && !this.data.draft.media.length) { wx.showToast({ title: "请先添加媒体，或改用一句话", icon: "none" }); return; }
    if (!this.data.draft.body.trim() && !this.data.draft.title.trim()) { wx.showToast({ title: "写下一点此刻的感受", icon: "none" }); return; }
    this.persistNow(); wx.navigateTo({ url: `/pkg-compose/preview/index?draftId=${this.data.draftId}` });
  },
  exit() {
    wx.showActionSheet({ itemList: ["保存草稿并退出", "不保存本次修改", "继续编辑"], success: (res: any) => { if (res.tapIndex === 0) { this.persistNow(); wx.navigateBack(); } else if (res.tapIndex === 1) { discardOnUnload = true; clearTimeout(saveTimer); if (originalDraft) store.saveDraft(this.data.draftId, originalDraft); wx.navigateBack(); } } });
  }
});
