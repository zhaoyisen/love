import type { Draft, MediaItem } from "../core/types";
import { apiRequest } from "./request";
import { mediaService } from "./media-service";

export const TEMPLATE_CATALOG = [
  { id: "cream-film", name: "奶油胶片", mark: "FILM 01", color: "cream" },
  { id: "strawberry-diary", name: "草莓手账", mark: "SWEET", color: "berry" },
  { id: "moon-blue", name: "月光蓝", mark: "MOON", color: "moon" },
  { id: "retro-polaroid", name: "复古拍立得", mark: "MEMO", color: "retro" },
  { id: "travel-stamp", name: "旅行邮票", mark: "TRIP", color: "travel" },
  { id: "minimal-memory", name: "极简纪念", mark: "2026", color: "minimal" }
] as const;

type TemplateId = typeof TEMPLATE_CATALOG[number]["id"];
type CanvasNode = any;

interface TemplateOptions {
  templateId: TemplateId;
  templateVersion: number;
  showDate: boolean;
  showCopy: boolean;
  sticker: "none" | "flower" | "heart" | "star";
  cropScale: number;
}

interface TemplateRenderResponse {
  id: string;
  rendered_asset_id: string;
  template_id: string;
  template_version: number;
  status: "PENDING" | "READY" | "FAILED";
}

const NAME_TO_ID: Record<string, TemplateId> = TEMPLATE_CATALOG.reduce((result, item) => {
  result[item.name] = item.id;
  return result;
}, {} as Record<string, TemplateId>);

const PALETTES: Record<TemplateId, { background: string; accent: string; ink: string; frame: string }> = {
  "cream-film": { background: "#F3E2CA", accent: "#C76D62", ink: "#4C4039", frame: "#FFF9EF" },
  "strawberry-diary": { background: "#F6D5D1", accent: "#B94B57", ink: "#5B3D3F", frame: "#FFF8F6" },
  "moon-blue": { background: "#B9C8D7", accent: "#37526E", ink: "#263A4D", frame: "#ECF4F6" },
  "retro-polaroid": { background: "#D1B694", accent: "#715340", ink: "#422F26", frame: "#F7EBD7" },
  "travel-stamp": { background: "#D9C49F", accent: "#496B62", ink: "#304942", frame: "#FFF7E8" },
  "minimal-memory": { background: "#E3E0D8", accent: "#30343A", ink: "#30343A", frame: "#FCFBF7" }
};

export function normalizeTemplateOptions(draft: Draft): TemplateOptions {
  const current = draft.templateOptions;
  const fallbackId = NAME_TO_ID[draft.template] || "cream-film";
  const candidate = current?.templateId as TemplateId | undefined;
  const templateId = TEMPLATE_CATALOG.some((item) => item.id === candidate) ? candidate! : fallbackId;
  return {
    templateId,
    templateVersion: 1,
    showDate: current?.showDate !== false,
    showCopy: current?.showCopy !== false,
    sticker: current?.sticker || "flower",
    cropScale: Math.max(0.8, Math.min(1.6, Number(current?.cropScale || 1)))
  };
}

export function templateName(templateId: string) {
  return TEMPLATE_CATALOG.find((item) => item.id === templateId)?.name || "原始照片";
}

function canvasNode(): Promise<CanvasNode> {
  return new Promise((resolve, reject) => {
    wx.createSelectorQuery().select("#templateRenderCanvas").fields({ node: true, size: true }).exec((rows: any[]) => {
      const result = rows && rows[0];
      if (!result?.node) {
        reject(new Error("模板画布尚未就绪，请稍后重试。"));
        return;
      }
      resolve(result.node);
    });
  });
}

function loadImage(canvas: CanvasNode, path: string): Promise<any> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("有一张照片无法用于模板生成，请重新选择。"));
    image.src = path;
  });
}

function dateText(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TODAY";
  return `${date.getFullYear()} · ${`${date.getMonth() + 1}`.padStart(2, "0")} · ${`${date.getDate()}`.padStart(2, "0")}`;
}

function drawCover(ctx: any, image: any, x: number, y: number, width: number, height: number, cropScale: number) {
  const baseScale = Math.max(width / image.width, height / image.height) * cropScale;
  const drawWidth = image.width * baseScale;
  const drawHeight = image.height * baseScale;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
  ctx.restore();
}

function photoSlots(count: number) {
  const x = 72; const y = 214; const width = 936; const height = 930; const gap = 18;
  if (count <= 1) return [{ x, y, width, height }];
  if (count === 2) return [{ x, y, width, height: (height - gap) / 2 }, { x, y: y + (height + gap) / 2, width, height: (height - gap) / 2 }];
  if (count === 3) return [
    { x, y, width: (width - gap) * 0.56, height },
    { x: x + (width + gap) * 0.56, y, width: (width - gap) * 0.44, height: (height - gap) / 2 },
    { x: x + (width + gap) * 0.56, y: y + (height + gap) / 2, width: (width - gap) * 0.44, height: (height - gap) / 2 }
  ];
  return [
    { x, y, width: (width - gap) / 2, height: (height - gap) / 2 },
    { x: x + (width + gap) / 2, y, width: (width - gap) / 2, height: (height - gap) / 2 },
    { x, y: y + (height + gap) / 2, width: (width - gap) / 2, height: (height - gap) / 2 },
    { x: x + (width + gap) / 2, y: y + (height + gap) / 2, width: (width - gap) / 2, height: (height - gap) / 2 }
  ];
}

async function createRenderedFile(draft: Draft, options: TemplateOptions): Promise<MediaItem> {
  const paths = draft.media.map((item) => item.path).filter(Boolean) as string[];
  if (!paths.length) throw new Error("请先选择至少一张照片。");
  const canvas = await canvasNode();
  const width = 1080; const height = 1440; const dpr = Math.min(2, wx.getSystemInfoSync().pixelRatio || 1);
  canvas.width = width * dpr; canvas.height = height * dpr;
  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  const palette = PALETTES[options.templateId];
  ctx.fillStyle = palette.background; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = palette.frame; ctx.fillRect(42, 42, width - 84, height - 84);
  ctx.fillStyle = palette.background; ctx.fillRect(58, 58, width - 116, 112);

  const images = await Promise.all(paths.slice(0, 4).map((path) => loadImage(canvas, path)));
  const slots = photoSlots(Math.min(paths.length, 4));
  images.forEach((image, index) => {
    const slot = slots[index];
    drawCover(ctx, image, slot.x, slot.y, slot.width, slot.height, options.cropScale);
  });
  if (paths.length > 4) {
    ctx.fillStyle = "rgba(20, 22, 22, .58)"; ctx.fillRect(72, 214, 936, 930);
    ctx.fillStyle = "#FFF"; ctx.font = "bold 82px serif"; ctx.textAlign = "center"; ctx.fillText(`+${paths.length - 1}`, 540, 680);
    ctx.font = "28px sans-serif"; ctx.fillText("这一页先收下一张封面", 540, 734);
  }

  ctx.fillStyle = palette.accent; ctx.fillRect(72, 1168, 936, 5);
  ctx.fillStyle = palette.ink; ctx.textAlign = "left"; ctx.font = "bold 28px serif"; ctx.fillText(templateName(options.templateId).toUpperCase(), 74, 118);
  if (options.showDate) { ctx.textAlign = "right"; ctx.font = "24px sans-serif"; ctx.fillText(dateText(draft.occurredAt), 1006, 118); }
  if (options.showCopy) {
    ctx.textAlign = "left"; ctx.font = "bold 46px serif"; ctx.fillStyle = palette.ink;
    const copy = (draft.title || draft.body || "今天也有值得记住的小事").slice(0, 24);
    ctx.fillText(copy, 72, 1240);
  }
  const sticker = { flower: "✿", heart: "♡", star: "✦", none: "" }[options.sticker];
  if (sticker) { ctx.textAlign = "right"; ctx.fillStyle = palette.accent; ctx.font = "78px serif"; ctx.fillText(sticker, 994, 1327); }
  ctx.textAlign = "left"; ctx.fillStyle = palette.ink; ctx.font = "22px sans-serif"; ctx.fillText("LOVE NOTES · TEMPLATE v1", 72, 1342);

  const path = await new Promise<string>((resolve, reject) => wx.canvasToTempFilePath({
    canvas, fileType: "jpg", quality: 0.92, destWidth: width, destHeight: height,
    success: (result: any) => resolve(result.tempFilePath), fail: () => reject(new Error("模板图片导出失败，请重试。"))
  }));
  let size = 0;
  try { size = Number(wx.getFileSystemManager().statSync(path).size || 0); } catch (_) { /* upload service will validate when available */ }
  return { id: `template_${Date.now()}`, type: "IMAGE", path, fileName: `love-notes-template-${Date.now()}.jpg`, mimeType: "image/jpeg", size, progress: 0, status: "UPLOADING" };
}

export async function renderTemplatePreview(draft: Draft): Promise<string> {
  const file = await createRenderedFile(draft, normalizeTemplateOptions(draft));
  return file.path || "";
}

export const templateRenderService = {
  async renderAndRegister(draft: Draft, sourceAssetIds: string[]) {
    const options = normalizeTemplateOptions(draft);
    try {
      const output = await createRenderedFile(draft, options);
      const uploaded = await mediaService.upload(output, () => undefined);
      const render = await apiRequest<TemplateRenderResponse>({
        path: "/template-renders", method: "POST",
        data: {
          source_asset_ids: sourceAssetIds,
          rendered_asset_id: uploaded.asset.id,
          template_id: options.templateId,
          template_version: options.templateVersion,
          render_config: JSON.stringify({ showDate: options.showDate, showCopy: options.showCopy, sticker: options.sticker, cropScale: options.cropScale, layout: draft.media.length <= 1 ? "POSTER" : draft.media.length <= 4 ? "COLLAGE" : "COVER" })
        }
      });
      return { renderedAssetId: render.rendered_asset_id, localPath: output.path || "", templateName: templateName(render.template_id), status: render.status };
    } catch (error: any) {
      if (error?.code === "CONTENT_BLOCKED") throw error;
      const failure: any = new Error(error?.message || "模板生成失败，原图仍可直接发布。");
      failure.code = "TEMPLATE_RENDER_FAILED";
      throw failure;
    }
  }
};
