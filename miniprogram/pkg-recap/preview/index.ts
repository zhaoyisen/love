import { store } from "../../core/store";
import { mockApi } from "../../core/mock-api";
import { decorateMoment } from "../../core/format";
import { appService, promptModerationAppeal, redirectExpiredSession, userError } from "../../services/app-service";

const POSTER_CANVAS_ID = "recapPosterCanvas";
const POSTER_WIDTH = 375;
const COVER_HEIGHT = 500;
const CARD_HEIGHT = 286;
const CARD_GAP = 24;
const FOOTER_HEIGHT = 230;

function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function modal(options: Record<string, any>) {
  return new Promise<any>((resolve) => wx.showModal({ ...options, success: resolve, fail: resolve }));
}

function canvasDraw(ctx: any) {
  return new Promise<void>((resolve) => ctx.draw(false, () => setTimeout(resolve, 80)));
}

function canvasToTempFilePath(context: any, width: number, height: number) {
  const ratio = height <= 6000 ? 2 : 1;
  return new Promise<string>((resolve, reject) => {
    wx.canvasToTempFilePath({
      canvasId: POSTER_CANVAS_ID,
      width,
      height,
      destWidth: width * ratio,
      destHeight: height * ratio,
      fileType: "jpg",
      quality: 0.92,
      success: (res: any) => resolve(res.tempFilePath),
      fail: reject
    }, context);
  });
}

function saveImage(filePath: string) {
  return new Promise<void>((resolve, reject) => {
    wx.saveImageToPhotosAlbum({ filePath, success: () => resolve(), fail: reject });
  });
}

function localImagePath(src?: string) {
  if (!src) return Promise.resolve("");
  return new Promise<string>((resolve) => {
    wx.getImageInfo({ src, success: (res: any) => resolve(res.path), fail: () => resolve("") });
  });
}

function safeText(value: any, fallback = "") {
  return String(value || fallback).replace(/\s+/g, " ").trim();
}

function truncate(value: any, max: number, fallback = "") {
  const text = safeText(value, fallback);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function fillRect(ctx: any, color: string, x: number, y: number, width: number, height: number) {
  ctx.setFillStyle(color);
  ctx.fillRect(x, y, width, height);
}

function strokeRect(ctx: any, color: string, x: number, y: number, width: number, height: number) {
  ctx.setStrokeStyle(color);
  ctx.strokeRect(x, y, width, height);
}

function setText(ctx: any, size: number, color: string, align: "left" | "center" | "right" = "left") {
  ctx.setFontSize(size);
  ctx.setFillStyle(color);
  ctx.setTextAlign(align);
  ctx.setTextBaseline("top");
}

function textWidth(ctx: any, text: string) {
  try { return ctx.measureText(text).width || 0; }
  catch (_) { return text.length * 14; }
}

function wrapText(ctx: any, value: any, maxWidth: number, maxLines: number) {
  const text = safeText(value);
  if (!text) return [];
  const lines: string[] = [];
  let line = "";
  for (const char of text) {
    const next = `${line}${char}`;
    if (textWidth(ctx, next) <= maxWidth) {
      line = next;
      continue;
    }
    if (line) lines.push(line);
    line = char;
    if (lines.length >= maxLines) break;
  }
  if (line && lines.length < maxLines) lines.push(line);
  if (lines.length === maxLines && textWidth(ctx, lines[maxLines - 1]) < textWidth(ctx, text)) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > 1 ? `${last.slice(0, -1)}…` : "…";
  }
  return lines;
}

function drawLines(ctx: any, lines: string[], x: number, y: number, lineHeight: number) {
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
}

function drawCover(ctx: any, recap: any, count: number, relationshipName: string) {
  fillRect(ctx, "#496357", 0, 0, POSTER_WIDTH, COVER_HEIGHT);
  strokeRect(ctx, "rgba(255,255,255,.45)", 20, 20, POSTER_WIDTH - 40, COVER_HEIGHT - 40);
  ctx.beginPath();
  ctx.setStrokeStyle("rgba(255,255,255,.28)");
  ctx.arc(302, 132, 118, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(318, 165, 166, 0, Math.PI * 2);
  ctx.stroke();
  setText(ctx, 12, "rgba(255,255,255,.76)");
  ctx.fillText("LOVE NOTES · ANNUAL RECAP", 32, 52);
  setText(ctx, 88, "rgba(255,255,255,.12)");
  ctx.fillText(String(recap.year || new Date().getFullYear()), 28, 104);
  setText(ctx, 30, "#FFF9F4");
  drawLines(ctx, wrapText(ctx, recap.title || `我们的 ${recap.year || new Date().getFullYear()}`, 285, 2), 32, 250, 38);
  setText(ctx, 13, "rgba(255,255,255,.74)");
  ctx.fillText(relationshipName || "普通日子，也值得被认真保存", 32, 390);
  ctx.fillText(`${count} 段共同可见时刻 · 仅当前情侣关系可访问`, 32, 420);
}

function drawMomentCard(ctx: any, moment: any, imagePath: string, index: number, y: number) {
  const x = 26;
  const width = POSTER_WIDTH - 52;
  fillRect(ctx, "#FFFDF8", x, y, width, CARD_HEIGHT);
  strokeRect(ctx, "#DED4C8", x, y, width, CARD_HEIGHT);
  setText(ctx, 18, "#BD4E4E");
  ctx.fillText(`${String(index + 1).padStart(2, "0")}`, x + 20, y + 20);
  setText(ctx, 11, "#817970", "right");
  ctx.fillText(moment.date || "", x + width - 20, y + 24);
  if (imagePath) {
    ctx.drawImage(imagePath, x + 20, y + 58, 112, 112);
  } else {
    fillRect(ctx, "#E7D8CB", x + 20, y + 58, 112, 112);
    fillRect(ctx, "#DDB8A1", x + 34, y + 74, 84, 80);
  }
  setText(ctx, 19, "#2B2825");
  drawLines(ctx, wrapText(ctx, truncate(moment.title, 36, "一个普通却想记住的时刻"), 170, 2), x + 148, y + 62, 25);
  setText(ctx, 13, "#5F5851");
  drawLines(ctx, wrapText(ctx, moment.body || "这一天被认真留下。", 170, 3), x + 148, y + 122, 19);
  fillRect(ctx, "#EEF3ED", x + 20, y + 195, width - 40, 46);
  setText(ctx, 11, "#57665D");
  ctx.fillText(`${moment.mood || "平静"} · ${(moment.events || ["日常"])[0] || "日常"}`, x + 34, y + 211);
  setText(ctx, 10, "#9A8F84", "right");
  ctx.fillText("共同可见", x + width - 34, y + 212);
}

function drawFooter(ctx: any, y: number, count: number) {
  fillRect(ctx, "#F7F1E8", 0, y, POSTER_WIDTH, FOOTER_HEIGHT);
  fillRect(ctx, "#EEF3ED", 26, y + 18, POSTER_WIDTH - 52, 116);
  setText(ctx, 15, "#496357");
  ctx.fillText("分享前隐私检查", 48, y + 42);
  setText(ctx, 11, "#57665D");
  ctx.fillText(`包含：关系昵称、发生日期、${count} 段共同可见文字和展示图片`, 48, y + 72);
  ctx.fillText("不包含：私密记录、位置/设备 EXIF、永久媒体地址", 48, y + 96);
  setText(ctx, 18, "#BD4E4E", "center");
  ctx.fillText("未完待续", POSTER_WIDTH / 2, y + 158);
  setText(ctx, 11, "#817970", "center");
  ctx.fillText("普通的日子，继续慢慢写。", POSTER_WIDTH / 2, y + 190);
}

async function ensureAlbumPermission() {
  const setting = await new Promise<any>((resolve) => wx.getSetting({ success: resolve, fail: resolve }));
  if (setting && setting.authSetting && setting.authSetting["scope.writePhotosAlbum"] === false) {
    const result = await modal({
      title: "需要相册权限",
      content: "保存年度回顾长图需要打开相册写入权限。",
      confirmText: "去设置",
      cancelText: "取消"
    });
    if (!result.confirm) throw new Error("已取消保存");
    await new Promise((resolve) => wx.openSetting({ success: resolve, fail: resolve }));
    const latest = await new Promise<any>((resolve) => wx.getSetting({ success: resolve, fail: resolve }));
    if (latest && latest.authSetting && latest.authSetting["scope.writePhotosAlbum"] === false) {
      throw new Error("相册权限未开启");
    }
  }
}

Page({
  data: {
    recap: {} as any,
    moments: [] as any[],
    generating: false,
    saving: false,
    showDisclosure: false,
    loading: false,
    error: "",
    posterWidth: POSTER_WIDTH,
    posterHeight: COVER_HEIGHT + FOOTER_HEIGHT
  },

  async onShow() { await this.refresh(); },

  async refresh() {
    this.setData({ loading: appService.isRemote, error: "" });
    try {
      if (appService.isRemote) await appService.recap(store.getState().recap.year || new Date().getFullYear());
      this.render();
    } catch (error) {
      if (!redirectExpiredSession()) this.setData({ error: userError(error, "回顾同步失败，请稍后重试。") });
      this.render();
    } finally {
      this.setData({ loading: false });
    }
  },

  render() {
    const state = store.getState();
    this.setData({
      recap: state.recap,
      moments: state.recap.selectedMomentIds
        .map((id) => state.moments.find((item) => item.id === id))
        .filter(Boolean)
        .map(decorateMoment)
    });
  },

  toggleDisclosure() { this.setData({ showDisclosure: !this.data.showDisclosure }); },

  async generate() {
    this.setData({ generating: true });
    try {
      if (appService.isRemote) await appService.generateRecap(store.getState().recap.year || new Date().getFullYear());
      else await mockApi.generateRecap();
      this.render();
      wx.showToast({ title: "回顾已生成", icon: "success" });
    } catch (error) {
      if (!redirectExpiredSession()) {
        promptModerationAppeal(error, `年度回顾生成被拦截：${this.data.recap.title || ""}`, "RECAP", null);
        wx.showToast({ title: userError(error, "生成没有完成，请稍后重试。"), icon: "none" });
      }
    } finally {
      this.setData({ generating: false });
    }
  },

  async buildPoster() {
    const moments = (this.data.moments || []).slice(0, 30);
    const posterHeight = COVER_HEIGHT + moments.length * (CARD_HEIGHT + CARD_GAP) + FOOTER_HEIGHT;
    this.setData({ posterHeight });
    await wait(120);
    const imagePaths = await Promise.all(moments.map((item: any) => localImagePath(item.cover?.thumbnailPath || item.cover?.path)));
    const ctx = wx.createCanvasContext(POSTER_CANVAS_ID, this);
    fillRect(ctx, "#F7F1E8", 0, 0, POSTER_WIDTH, posterHeight);
    const relationshipName = store.getState().couple.relationshipName;
    drawCover(ctx, this.data.recap, moments.length, relationshipName);
    let y = COVER_HEIGHT + 28;
    moments.forEach((moment: any, index: number) => {
      drawMomentCard(ctx, moment, imagePaths[index], index, y);
      y += CARD_HEIGHT + CARD_GAP;
    });
    drawFooter(ctx, y + 4, moments.length);
    await canvasDraw(ctx);
    return canvasToTempFilePath(this, POSTER_WIDTH, posterHeight);
  },

  async save() {
    if (this.data.recap.status !== "READY") {
      wx.showToast({ title: "请先生成回顾", icon: "none" });
      return;
    }
    if (!this.data.moments.length) {
      wx.showToast({ title: "请先选择回顾片段", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    wx.showLoading({ title: "生成图片中", mask: true });
    try {
      await ensureAlbumPermission();
      const filePath = await this.buildPoster();
      await saveImage(filePath);
      wx.hideLoading();
      wx.showToast({ title: "已保存到相册", icon: "success" });
    } catch (error) {
      const message = userError(error, "保存失败，请稍后重试。");
      wx.hideLoading();
      wx.showToast({ title: message.length > 14 ? "保存失败，请重试" : message, icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  }
});
