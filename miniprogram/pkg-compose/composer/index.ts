import { store } from "../../core/store";
import type { Draft, MediaType } from "../../core/types";
import { appService, promptModerationAppeal, redirectExpiredSession, userError } from "../../services/app-service";
import { normalizeTemplateOptions, renderTemplatePreview, TEMPLATE_CATALOG, templateName } from "../../services/template-render-service";

const IMAGE_MAX_BYTES = 20 * 1024 * 1024;
const VIDEO_MAX_BYTES = 200 * 1024 * 1024;
const VIDEO_MAX_SECONDS = 60;
const IMAGE_MIME: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp" };
const VIDEO_MIME: Record<string, string> = { mp4: "video/mp4", mov: "video/quicktime" };

function selectedFileSize(path: string, provided: any) {
  if (Number(provided) > 0) return Number(provided);
  try { return Number(wx.getFileSystemManager().statSync(path).size || 0); }
  catch (_) { return 0; }
}

function selectedFile(file: any, mediaType: MediaType, index: number) {
  const path = file.tempFilePath || file.path || "";
  const fileName = String(path || `memory_${index}`).split(/[\\/]/).pop() || `memory_${index}`;
  const extension = fileName.split(".").pop()?.toLowerCase() || "";
  const mimeType = mediaType === "VIDEO" ? VIDEO_MIME[extension] : IMAGE_MIME[extension];
  const size = selectedFileSize(path, file.size);
  if (!mimeType) return { error: mediaType === "VIDEO" ? "仅支持 MP4、MOV 视频" : "仅支持 JPG、PNG、WEBP 图片" };
  if (size <= 0) return { error: "无法读取文件大小，请重新选择" };
  if (mediaType === "IMAGE" && size > IMAGE_MAX_BYTES) return { error: "单张图片不能超过 20 MB" };
  if (mediaType === "VIDEO" && size > VIDEO_MAX_BYTES) return { error: "视频不能超过 200 MB" };
  if (mediaType === "VIDEO" && Number(file.duration || 0) <= 0) return { error: "无法读取视频时长，请重新选择" };
  if (mediaType === "VIDEO" && Number(file.duration || 0) > VIDEO_MAX_SECONDS) return { error: "视频时长不能超过 60 秒" };
  return {
    media: {
      id: `local_${Date.now()}_${index}`,
      type: mediaType,
      path,
      fileName,
      mimeType,
      size,
      durationSeconds: mediaType === "VIDEO" ? Math.ceil(Number(file.duration || 0)) : undefined,
      progress: 100,
      status: "READY"
    }
  };
}

Page({
  data: {
    draftId: "", step: 1, draft: {} as Draft, paired: false, savedText: "已自动保存",
    mediaTypes: [
      { key: "IMAGE", label: "照片", note: "1–9 张" },
      { key: "VIDEO", label: "视频", note: "1 段" },
      { key: "TEXT", label: "文字", note: "安静写下" }
    ],
    steps: ["形式", "内容", "感受", "确认"],
    moods: ["开心", "心动", "平静", "想念", "委屈", "生气", "和好", "其他"],
    eventOptions: ["日常", "约会", "旅行", "纪念日", "第一次", "争执", "和好", "礼物", "共同成长", "其他"].map(value => ({ value, active: false })),
    bodyLeft: 1000, titleLeft: 30, today: "", selectedDate: "", displayDate: "", eventsLabel: "", mediaErrors: {} as Record<string, boolean>,
    viewportHeight: 640, keyboardHeight: 0, focusedField: "", compact: false, mediaTileSize: 96, previewHeight: 160,
    expanded: "mood", showLayout: false, previewIndex: 0, publishing: false, published: false,
    error: "", publishText: "确认发布", templateRendering: false, templatePreview: "",
    templates: TEMPLATE_CATALOG, selectedTemplate: "cream-film", showDate: true, showCopy: true,
    sticker: "flower", cropScale: 100, layoutLabel: "单张海报"
  },
  onLoad(query: any) {
    this._alive = true;
    this._discard = false;
    this._templateSequence = 0;
    const draft = (query.draftId && store.getDraft(query.draftId)) || store.createDraft("IMAGE");
    this._originalDraft = JSON.parse(JSON.stringify(draft));
    let step = Math.max(1, Math.min(4, Math.floor(Number(draft.step) || 1)));
    if (draft.mediaType !== "TEXT" && !draft.media.length) step = 1;
    else if (step > 2 && !draft.title.trim() && !draft.body.trim()) step = 2;
    this.setData({
      draftId: draft.id, draft: { ...draft, step }, step,
      bodyLeft: 1000 - draft.body.length, titleLeft: 30 - draft.title.length,
      today: this.dateValue(new Date()), selectedDate: this.dateValue(new Date(draft.occurredAt)), displayDate: this.dateLabel(new Date(draft.occurredAt)),
      eventsLabel: draft.events.join("、"),
      eventOptions: this.data.eventOptions.map((item: any) => ({ ...item, active: draft.events.includes(item.value) }))
    });
    this.syncTemplateOptions();
    this.updateViewport();
  },
  onShow() {
    const paired = store.getState().couple.status === "PAIRED";
    this.setData({ paired });
    if (!paired && this.data.draft.visibility === "SHARED") this.patchDraft({ visibility: "PRIVATE" });
  },
  onHide() { if (!this.data.publishing && !this.data.published) this.persistNow(); },
  onUnload() {
    if (!this._discard && !this.data.publishing && !this.data.published) this.persistNow();
    this._alive = false;
    this._templateSequence++;
    clearTimeout(this._saveTimer);
    clearTimeout(this._redirectTimer);
    clearInterval(this._progressTimer);
  },
  onResize(event: any) {
    if (!this.data.keyboardHeight) this.updateViewport(event.size);
  },
  updateViewport(size?: any) {
    const info = size || (wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync());
    const viewportHeight = Number(info.windowHeight) || this.data.viewportHeight;
    this._viewportWidth = Number(info.windowWidth) || this._viewportWidth || 375;
    this.setData({ viewportHeight });
    this.fitContent();
  },
  keyboardChange(event: any) {
    this.setData({ keyboardHeight: Math.max(0, Number(event.detail.height) || 0) });
    this.fitContent();
  },
  fieldFocus(event: any) { this.setData({ focusedField: event.currentTarget.dataset.field }); },
  fitContent() {
    const height = this.data.viewportHeight - this.data.keyboardHeight;
    this.setData({
      compact: height < 600,
      mediaTileSize: Math.max(44, Math.floor(Math.min((Math.min(this._viewportWidth || 375, 480) - 56) / 3, (height - 350) / 3))),
      previewHeight: Math.max(64, Math.min(180, Math.floor((height - 350) * .45)))
    });
  },
  dateValue(date: Date) {
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0") + "-" + String(date.getDate()).padStart(2, "0");
  },
  dateLabel(date: Date) { return date.getFullYear() + "年" + (date.getMonth() + 1) + "月" + date.getDate() + "日"; },
  patchDraft(patch: Partial<Draft>) {
    this.setData({ draft: { ...this.data.draft, ...patch }, savedText: "正在保存…" });
    clearTimeout(this._saveTimer);
    this._saveTimer = setTimeout(() => this.persistNow(), 3000);
  },
  persistNow() {
    clearTimeout(this._saveTimer);
    if (this._discard || this.data.published || !this.data.draftId || !this.data.draft.id) return;
    store.saveDraft(this.data.draftId, this.data.draft);
    if (this._alive) this.setData({ savedText: "已自动保存" });
  },
  selectType(event: any) {
    if (this.data.publishing) return;
    const mediaType = event.currentTarget.dataset.type as MediaType;
    if (!["IMAGE", "VIDEO", "TEXT"].includes(mediaType) || mediaType === this.data.draft.mediaType) return;
    const apply = () => {
      this.patchDraft({ mediaType, media: [] });
      this.setData({ previewIndex: 0, templatePreview: "" });
    };
    if (this.data.draft.media.length) {
      wx.showModal({ title: "更换记录形式？", content: "更换后，当前已选择的媒体会被移除。", confirmText: "确认更换", success: (res: any) => { if (res.confirm && this._alive) apply(); } });
    } else apply();
  },
  async chooseMedia() {
    const mediaType = this.data.draft.mediaType;
    if (this.data.publishing || mediaType === "TEXT") return;
    const limit = mediaType === "VIDEO" ? 1 : 9;
    if (this.data.draft.media.length >= limit) { wx.showToast({ title: mediaType === "VIDEO" ? "每条记录只能添加一个视频" : "照片最多添加 9 张", icon: "none" }); return; }
    try {
      const result = await new Promise<any>((resolve, reject) => {
        const remaining = limit - this.data.draft.media.length;
        if (mediaType === "VIDEO" && wx.chooseVideo) wx.chooseVideo({ sourceType: ["album", "camera"], compressed: true, maxDuration: VIDEO_MAX_SECONDS, success: (res: any) => resolve({ tempFiles: [{ tempFilePath: res.tempFilePath, fileType: "video", size: res.size, duration: res.duration }] }), fail: reject });
        else if (wx.chooseMedia) wx.chooseMedia({ count: remaining, mediaType: ["image"], sourceType: ["album", "camera"], success: resolve, fail: reject });
        else wx.chooseImage({ count: remaining, success: (res: any) => resolve({ tempFiles: res.tempFilePaths.map((path: string) => ({ tempFilePath: path, fileType: "image" })) }), fail: reject });
      });
      if (!this._alive || mediaType !== this.data.draft.mediaType) return;
      const selections = result.tempFiles.map((file: any, index: number) => selectedFile(file, mediaType, index));
      const media = selections.filter((item: any) => item.media).map((item: any) => item.media);
      const invalid = selections.find((item: any) => item.error);
      if (invalid) wx.showToast({ title: invalid.error, icon: "none", duration: 3000 });
      if (media.length) this.patchDraft({ media: [...this.data.draft.media, ...media].slice(0, limit) });
    } catch (_) { /* user cancelled */ }
  },
  removeMedia(event: any) {
    if (this.data.publishing) return;
    this.patchDraft({ media: this.data.draft.media.filter((_: any, index: number) => index !== Number(event.currentTarget.dataset.index)) });
    this.setData({ previewIndex: 0, templatePreview: "" });
  },
  mediaError(event: any) { this.setData({ mediaErrors: { ...this.data.mediaErrors, [event.currentTarget.dataset.id]: true } }); },
  titleInput(event: any) { const title = event.detail.value; this.setData({ titleLeft: 30 - title.length }); this.patchDraft({ title }); },
  bodyInput(event: any) { const body = event.detail.value; this.setData({ bodyLeft: 1000 - body.length }); this.patchDraft({ body }); },
  toggleSection(event: any) {
    if (!this.data.publishing) this.setData({ expanded: this.data.expanded === event.currentTarget.dataset.section ? "" : event.currentTarget.dataset.section });
  },
  selectMood(event: any) { if (!this.data.publishing) this.patchDraft({ mood: event.currentTarget.dataset.value }); },
  toggleEvent(event: any) {
    if (this.data.publishing) return;
    const value = event.currentTarget.dataset.value;
    const events = [...this.data.draft.events];
    const index = events.indexOf(value);
    if (index >= 0) events.splice(index, 1);
    else if (events.length < 3) events.push(value);
    else { wx.showToast({ title: "事件标签最多选 3 个", icon: "none" }); return; }
    this.setData({ eventsLabel: events.join("、"), eventOptions: this.data.eventOptions.map((item: any) => ({ ...item, active: events.includes(item.value) })) });
    this.patchDraft({ events });
  },
  dateChange(event: any) {
    if (this.data.publishing) return;
    const selectedDate = event.detail.value;
    if (selectedDate > this.data.today) { wx.showToast({ title: "不能选择未来日期", icon: "none" }); return; }
    const [year, month, day] = selectedDate.split("-").map(Number);
    const current = new Date(this.data.draft.occurredAt);
    current.setFullYear(year, month - 1, day);
    this.setData({ selectedDate, displayDate: this.dateLabel(current) });
    this.patchDraft({ occurredAt: current.toISOString() });
  },
  visibility(event: any) {
    if (this.data.publishing) return;
    const value = event.currentTarget.dataset.value;
    if (value === "SHARED" && store.getState().couple.status !== "PAIRED") { wx.showToast({ title: "配对后才能共同可见", icon: "none" }); return; }
    this.patchDraft({ visibility: value });
    this.setData({ expanded: "" });
  },
  validContent() {
    if (this.data.draft.mediaType !== "TEXT" && !this.data.draft.media.length) { wx.showToast({ title: "请先添加媒体，或改用一句话", icon: "none" }); return false; }
    if (!this.data.draft.body.trim() && !this.data.draft.title.trim()) { wx.showToast({ title: "写下一点此刻的感受", icon: "none" }); return false; }
    return true;
  },
  goStep(step: number) {
    if (this.data.publishing) return;
    wx.hideKeyboard();
    this.setData({ step, keyboardHeight: 0, focusedField: "", showLayout: false, expanded: step === 3 ? "mood" : "", error: "" });
    this.patchDraft({ step });
    this.persistNow();
    this.fitContent();
  },
  next() {
    if (this.data.step === 1 && this.data.draft.mediaType !== "TEXT" && !this.data.draft.media.length) { wx.showToast({ title: "请先选择媒体，或改用纯文字", icon: "none" }); return; }
    if (this.data.step >= 2 && !this.validContent()) return;
    this.goStep(Math.min(4, this.data.step + 1));
  },
  previous() { this.goStep(Math.max(1, this.data.step - 1)); },
  edit() { this.goStep(2); },
  previewChange(event: any) { this.setData({ previewIndex: Number(event.detail.current) || 0 }); },
  syncTemplateOptions() {
    const options = normalizeTemplateOptions(this.data.draft);
    const count = this.data.draft.media.length;
    this.setData({
      selectedTemplate: options.templateId, showDate: options.showDate, showCopy: options.showCopy,
      sticker: options.sticker, cropScale: Math.round(options.cropScale * 100),
      layoutLabel: count <= 1 ? "单张海报" : count <= 4 ? count + " 图拼贴" : count + " 张 · 封面模式"
    });
  },
  beautify() {
    if (this.data.publishing || this.data.draft.mediaType !== "IMAGE" || !this.data.draft.media.length) return;
    this.persistNow();
    this.syncTemplateOptions();
    this.setData({ showLayout: true, expanded: "" });
    this.renderLayout();
  },
  async renderLayout() {
    this._templateSequence++;
    if (this.data.templateRendering) return;
    this.setData({ templateRendering: true });
    try {
      while (this._alive && this.data.showLayout && this.data.draft.template !== "原始照片") {
        const sequence = this._templateSequence;
        try {
          const path = await renderTemplatePreview(this.data.draft);
          if (this._alive && this.data.showLayout && sequence === this._templateSequence) this.setData({ templatePreview: path });
        } catch (error) {
          if (this._alive && sequence === this._templateSequence) {
            this.setData({ templatePreview: "" });
            wx.showToast({ title: userError(error, "模板画布尚未就绪，请稍后重试。"), icon: "none" });
          }
        }
        if (sequence === this._templateSequence) break;
      }
    } finally { if (this._alive) this.setData({ templateRendering: false }); }
  },
  saveOptions(patch: Record<string, any>) {
    if (this.data.publishing) return;
    const options = { ...normalizeTemplateOptions(this.data.draft), ...patch };
    this.patchDraft({ template: templateName(options.templateId), templateOptions: options });
    this.syncTemplateOptions();
    this.renderLayout();
  },
  selectTemplate(event: any) { this.saveOptions({ templateId: event.currentTarget.dataset.id }); },
  toggleDate() { this.saveOptions({ showDate: !this.data.showDate }); },
  toggleCopy() { this.saveOptions({ showCopy: !this.data.showCopy }); },
  cycleSticker() {
    const stickers = ["flower", "heart", "star", "none"];
    this.saveOptions({ sticker: stickers[(stickers.indexOf(this.data.sticker) + 1) % stickers.length] });
  },
  cropChange(event: any) { this.saveOptions({ cropScale: Number(event.detail.value) / 100 }); },
  resetTemplate() {
    this._templateSequence++;
    this.patchDraft({ template: "原始照片" });
    this.setData({ templatePreview: "" });
  },
  closeLayout() {
    this._templateSequence++;
    this.persistNow();
    this.setData({ showLayout: false });
  },
  useLayout() {
    this.closeLayout();
    if (this.data.draft.template !== "原始照片") wx.showToast({ title: "发布时将生成模板图", icon: "none" });
  },
  mediaHelp() {
    wx.showModal({
      title: "选择记录形式",
      content: "先选照片、视频或文字，再补上一点当时的感受。\n更换形式会移除已经选择的媒体，已写的文字仍会保留。\n只在你主动选择时读取媒体，原图不会被模板覆盖。" + (appService.isRemote ? "\n私有上传：媒体使用短期凭证直传私有存储，永久密钥不会进入小程序。" : ""),
      showCancel: false
    });
  },
  layoutHelp() {
    wx.showModal({ title: "图片排版", content: this.data.layoutLabel + "会在发布时真实导出并上传模板图，原图始终保留。若生成失败，可重试或直接发布原图。", showCancel: false });
  },
  publishDetails() {
    const media = this.data.draft.media.map((item: any) => (item.fileName || (item.type === "VIDEO" ? "视频" : "照片")) + "：" + (item.status === "UPLOADING" ? "正在上传 " + item.progress + "%" : item.status === "PROCESSING" ? "安全处理中，完成前仅自己可见" : item.status === "FAILED" ? (item.error || "上传失败，可重试") : "等待上传"));
    wx.showModal({ title: this.data.error ? "发布没有完成" : "媒体上传", content: [this.data.error, ...media].filter(Boolean).join("\n"), showCancel: false });
  },
  async publish(skipTemplate: any = false) {
    // bindtap supplies an event, not the explicit template-failure retry flag.
    skipTemplate = skipTemplate === true;
    if (this.data.publishing || this.data.published || this.data.templateRendering || !this.validContent()) return;
    const paired = store.getState().couple.status === "PAIRED";
    this.setData({ paired });
    if (!paired && this.data.draft.visibility === "SHARED") this.patchDraft({ visibility: "PRIVATE" });
    this.persistNow();
    this.setData({ publishing: true, error: "", publishText: this.data.draft.mediaType === "TEXT" ? "正在发布" : "准备安全上传" });
    this._progressTimer = setInterval(() => {
      const draft = store.getDraft(this.data.draftId);
      if (!draft || !this._alive) return;
      const uploading = draft.media.find((item: any) => item.status === "UPLOADING");
      this.setData({ draft, publishText: uploading ? "正在上传 " + uploading.progress + "%" : draft.media.some((item: any) => item.status === "PROCESSING") ? "正在提交处理" : "正在发布" });
    }, 250);
    try {
      const moment = await appService.publish(this.data.draftId, { skipTemplate });
      if (!this._alive) return;
      if (!moment) { this.setData({ error: "草稿已失效，请返回重新编辑。" }); return; }
      this.setData({ published: true });
      wx.showToast({ title: "这一刻已收好", icon: "success" });
      this._redirectTimer = setTimeout(() => { if (this._alive) wx.reLaunch({ url: "/pages-main/time/index" }); }, 700);
    } catch (error) {
      if (!this._alive) return;
      const current = store.getDraft(this.data.draftId);
      if (current) this.setData({ draft: current });
      if (redirectExpiredSession()) return;
      if (error && (error as any).code === "TEMPLATE_RENDER_FAILED" && !skipTemplate) {
        this.setData({ error: userError(error, "模板生成失败，可直接发布原图。") });
        wx.showModal({ title: "模板生成失败", content: "原图已经安全上传。你可以重试，也可以直接发布原图，原图不会被覆盖。", confirmText: "发布原图", cancelText: "稍后重试", success: (result: any) => { if (result.confirm && this._alive) this.publish(true); } });
      } else {
        promptModerationAppeal(error, "发布记录被拦截：" + ((current || this.data.draft).title || "") + " " + ((current || this.data.draft).body || ""));
        this.setData({ error: userError(error, "发布没有完成，草稿仍保存在本机，可直接重试。") });
      }
    } finally {
      clearInterval(this._progressTimer);
      if (this._alive) this.setData({ publishing: false, publishText: "重试发布" });
    }
  },
  exit() {
    if (this.data.publishing || this.data.published) return;
    wx.showActionSheet({ itemList: ["保存草稿并退出", "不保存本次修改", "继续编辑"], success: (res: any) => {
      if (!this._alive) return;
      if (res.tapIndex === 0) { this.persistNow(); wx.navigateBack(); }
      else if (res.tapIndex === 1) {
        this._discard = true;
        clearTimeout(this._saveTimer);
        if (this._originalDraft) store.saveDraft(this.data.draftId, this._originalDraft);
        wx.navigateBack();
      }
    } });
  }
});
