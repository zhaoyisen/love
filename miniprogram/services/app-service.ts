import { API_CONFIG } from "../core/api-config";
import { mockApi } from "../core/mock-api";
import { store } from "../core/store";
import type { Moment } from "../core/types";
import { authService } from "./auth-service";
import { coupleService } from "./couple-service";
import { momentService } from "./moment-service";
import { hasSession } from "./request";

const moodLabels: Record<string, string> = {
  HAPPY: "开心", HEARTBEAT: "心动", CALM: "平静", MISS: "想念",
  WRONGED: "委屈", ANGRY: "生气", RECONCILED: "和好", OTHER: "其他"
};

const eventLabels: Record<string, string> = {
  DAILY: "日常", DATE: "约会", TRAVEL: "旅行", ANNIVERSARY: "纪念日",
  FIRST: "第一次", CONFLICT: "争执", RECONCILED: "和好", GIFT: "礼物",
  GROWTH: "共同成长", OTHER: "其他"
};

function remoteMoment(item: any, currentUserId: string): Moment {
  const type = item.type || "TEXT";
  return {
    id: item.id,
    author: item.author_id === currentUserId ? "我" : "TA",
    title: item.title || "一个普通却想记住的时刻",
    body: item.body || "",
    occurredAt: item.occurred_at,
    mood: moodLabels[item.mood] || item.mood || "",
    events: (item.events || []).map((value: string) => eventLabels[value] || value),
    visibility: item.visibility,
    mediaType: type,
    media: type === "TEXT" ? [] : [{ id: `remote_${item.id}`, type, tone: "paper", progress: 100, status: "READY" }],
    comments: [],
    status: item.status === "TRASHED" ? "DELETED" : item.status
  };
}

async function synchronizeRemoteState() {
  const me = await authService.me();
  store.applyRemoteProfile({ id: me.id, name: me.nickname });
  const now = new Date();
  const from = new Date(now.getTime() - 366 * 86400000).toISOString();
  const to = new Date(now.getTime() + 5 * 60000).toISOString();
  const [couple, timeline] = await Promise.all([
    coupleService.current(),
    momentService.timeline(from, to, 50)
  ]);
  store.applyRemoteCouple(couple);
  const moments = (timeline.items || [])
    .filter((item: any) => item.status !== "TRASHED" && item.status !== "PURGED")
    .map((item: any) => remoteMoment(item, me.id));
  store.replaceRemoteMoments(moments);
}

export function userError(error: any, fallback = "操作没有完成，请稍后重试。") {
  if (error && typeof error.message === "string" && error.message.trim()) return error.message;
  return fallback;
}

export function redirectExpiredSession(): boolean {
  if (!API_CONFIG.useRemoteApi || hasSession()) return false;
  wx.reLaunch({ url: "/pages/welcome/index" });
  return true;
}

export const appService = {
  isRemote: API_CONFIG.useRemoteApi,
  hasSession,

  async login() {
    if (!API_CONFIG.useRemoteApi) {
      await mockApi.login();
      return;
    }
    const session = await authService.login();
    store.applyRemoteProfile({ id: session.user_id, name: session.nickname });
    await synchronizeRemoteState();
  },

  async refresh() {
    if (!API_CONFIG.useRemoteApi) return;
    await synchronizeRemoteState();
  },

  async publish(draftId: string) {
    const draft = store.getDraft(draftId);
    if (!draft) return undefined;
    if (!API_CONFIG.useRemoteApi) return mockApi.publish(draftId);
    if (draft.mediaType !== "TEXT") {
      const error: any = new Error("图片和视频正在接入安全上传，请先发布纯文字记录。");
      error.code = "MEDIA_UPLOAD_NOT_READY";
      throw error;
    }
    const result = await momentService.create(draft);
    const profileId = store.getState().profile.id || result.author_id;
    const moment = remoteMoment(result, profileId);
    store.publishRemoteDraft(draftId, moment);
    return moment;
  },

  async createInvitation() {
    if (!API_CONFIG.useRemoteApi) {
      return { token: "demo_invite", expires_at: new Date(Date.now() + 86400000).toISOString() };
    }
    return coupleService.createInvitation();
  },

  async previewInvitation(token: string) {
    if (!API_CONFIG.useRemoteApi) return { inviter_nickname: "小满", expires_at: new Date(Date.now() + 86400000).toISOString() };
    return coupleService.previewInvitation(token);
  },

  async acceptInvitation(token: string) {
    if (!API_CONFIG.useRemoteApi) {
      await mockApi.acceptInvitation();
      return;
    }
    const couple = await coupleService.acceptInvitation(token);
    store.applyRemoteCouple(couple);
  },

  async unbind(confirmText: string) {
    if (!API_CONFIG.useRemoteApi) {
      await mockApi.unbind();
      return;
    }
    const couple = store.getState().couple;
    if (couple.version === undefined) throw new Error("情侣空间状态尚未同步，请返回刷新后重试。");
    const result = await coupleService.unbind(couple.version, confirmText);
    store.applyRemoteCouple(result);
  }
};
