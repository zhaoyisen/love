import { store } from "../../core/store";
import { normalizeTemplateOptions, renderTemplatePreview, TEMPLATE_CATALOG, templateName } from "../../services/template-render-service";

let previewSequence = 0;

Page({
  data: {
    draftId: "", draft: {} as any, selected: "cream-film", showDate: true, showCopy: true,
    sticker: "flower", cropScale: 100, layoutLabel: "单张海报", previewPath: "",
    templates: TEMPLATE_CATALOG
  },
  onLoad(query: any) {
    const draft = store.getDraft(query.draftId);
    if (!draft) { wx.navigateBack(); return; }
    const options = normalizeTemplateOptions(draft);
    this.setData({
      draftId: draft.id, draft, selected: options.templateId, showDate: options.showDate, showCopy: options.showCopy,
      sticker: options.sticker, cropScale: Math.round(options.cropScale * 100), layoutLabel: this.layoutLabel(draft.media.length)
    });
  },
  onReady() { this.renderPreview(this.data.draft); },
  layoutLabel(count: number) {
    return count <= 1 ? "单张海报" : count <= 4 ? `${count} 图拼贴` : `${count} 张 · 封面模式`;
  },
  saveOptions(patch: Record<string, any>) {
    const options = { ...normalizeTemplateOptions(this.data.draft), ...patch };
    const draft = { ...this.data.draft, template: templateName(options.templateId), templateOptions: options };
    this.setData({ draft, selected: options.templateId, showDate: options.showDate, showCopy: options.showCopy, sticker: options.sticker, cropScale: Math.round(options.cropScale * 100) });
    store.saveDraft(this.data.draftId, { template: draft.template, templateOptions: options });
    this.renderPreview(draft);
  },
  async renderPreview(draft: any) {
    const sequence = ++previewSequence;
    try {
      const previewPath = await renderTemplatePreview(draft);
      if (sequence === previewSequence) this.setData({ previewPath });
    } catch (_) { if (sequence === previewSequence) this.setData({ previewPath: "" }); }
  },
  select(event: any) { this.saveOptions({ templateId: event.currentTarget.dataset.id }); },
  toggleDate() { this.saveOptions({ showDate: !this.data.showDate }); },
  toggleCopy() { this.saveOptions({ showCopy: !this.data.showCopy }); },
  cycleSticker() {
    const items = ["flower", "heart", "star", "none"];
    const next = items[(items.indexOf(this.data.sticker) + 1) % items.length] as any;
    this.saveOptions({ sticker: next });
  },
  cropChange(event: any) { this.saveOptions({ cropScale: Number(event.detail.value) / 100 }); },
  reset() {
    const draft = { ...this.data.draft, template: "原始照片", templateOptions: { ...normalizeTemplateOptions(this.data.draft), templateId: "cream-film" } };
    this.setData({ draft, previewPath: "" });
    store.saveDraft(this.data.draftId, { template: "原始照片", templateOptions: draft.templateOptions });
  },
  done() { wx.showToast({ title: "发布时将生成模板图", icon: "success" }); setTimeout(() => wx.navigateBack(), 500); }
});
