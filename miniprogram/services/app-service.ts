import { API_CONFIG } from "../core/api-config";
import { mockApi } from "../core/mock-api";
import { store } from "../core/store";
import type { Moment } from "../core/types";
import { authService } from "./auth-service";
import { coupleService } from "./couple-service";
import { mediaService } from "./media-service";
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
    media: type === "TEXT" ? [] : (item.media || []).map((media: any) => ({
      id: media.id,
      assetId: media.id,
      type: media.kind || type,
      path: media.access_url,
      thumbnailPath: media.thumbnail_url,
      tone: "paper",
      progress: media.status === "READY" ? 100 : 99,
      status: media.status === "READY" ? "READY" : media.status === "FAILED" || media.status === "BLOCKED" ? "FAILED" : "PROCESSING"
    })),
    comments: [],
    status: item.status === "TRASHED" ? "DELETED" : item.status,
    version: item.version,
    deletedAt: item.deleted_at
  };
}

function updateDraftMedia(draftId: string, mediaId: string, patch: Record<string, any>) {
  const draft = store.getDraft(draftId);
  if (!draft) return;
  store.saveDraft(draftId, { media: draft.media.map((item) => item.id === mediaId ? { ...item, ...patch } : item) });
}

async function uploadDraftMedia(draftId: string) {
  const draft = store.getDraft(draftId);
  if (!draft) return [];
  const assetIds: string[] = [];
  for (const file of draft.media) {
    if (file.assetId && (file.status === "READY" || file.status === "PROCESSING")) {
      assetIds.push(file.assetId);
      continue;
    }
    updateDraftMedia(draftId, file.id, { status: "UPLOADING", progress: 1, error: "" });
    try {
      const result = await mediaService.upload(file, (progress) => updateDraftMedia(draftId, file.id, { status: "UPLOADING", progress }));
      const status = result.asset.status === "READY" ? "READY" : "PROCESSING";
      updateDraftMedia(draftId, file.id, {
        assetId: result.asset.id,
        uploadSessionId: result.session.upload_session_id,
        status,
        progress: 100,
        path: result.asset.access_url || file.path,
        thumbnailPath: result.asset.thumbnail_url
      });
      assetIds.push(result.asset.id);
    } catch (error) {
      updateDraftMedia(draftId, file.id, { status: "FAILED", error: userError(error, "媒体上传失败，请重试。") });
      throw error;
    }
  }
  return assetIds;
}

async function synchronizeRemoteState() {
  const me = await authService.me();
  store.applyRemoteProfile({ id: me.id, name: me.nickname });
  const now = new Date();
  const from = new Date("2000-01-01T00:00:00.000Z").toISOString();
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
  return { from, to, nextCursor: timeline.next_cursor || "", hasMore: Boolean(timeline.has_more) };
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
    return synchronizeRemoteState();
  },

  async updateProfile(nickname: string) {
    const normalized = nickname.trim();
    if (!API_CONFIG.useRemoteApi) {
      store.updateProfileName(normalized);
      return;
    }
    const profile = await authService.updateProfile(normalized);
    store.applyRemoteProfile({ id: profile.id, name: profile.nickname });
  },

  async publish(draftId: string) {
    const draft = store.getDraft(draftId);
    if (!draft) return undefined;
    if (!API_CONFIG.useRemoteApi) return mockApi.publish(draftId);
    const assetIds = draft.mediaType === "TEXT" ? [] : await uploadDraftMedia(draftId);
    const latestDraft = store.getDraft(draftId) || draft;
    const result = await momentService.create(latestDraft, assetIds);
    const profileId = store.getState().profile.id || result.author_id;
    const moment = remoteMoment(result, profileId);
    moment.media = moment.media.map((item, index) => ({ ...item, path: item.path || latestDraft.media[index]?.path }));
    store.publishRemoteDraft(draftId, moment);
    return moment;
  },

  async detail(momentId: string) {
    if (!API_CONFIG.useRemoteApi) return store.getMoment(momentId);
    const result = await momentService.detail(momentId);
    const moment = remoteMoment(result, store.getState().profile.id || result.author_id);
    store.upsertRemoteMoment(moment);
    return moment;
  },

  async updateMoment(momentId: string, version: number, draft: any) {
    if (!API_CONFIG.useRemoteApi) return store.editMoment(momentId, draft);
    const result = await momentService.update(momentId, version, draft);
    const moment = remoteMoment(result, store.getState().profile.id || result.author_id);
    store.upsertRemoteMoment(moment);
    return moment;
  },

  async trashMoment(momentId: string, version: number) {
    if (!API_CONFIG.useRemoteApi) {
      store.deleteMoment(momentId);
      return;
    }
    await momentService.trash(momentId, version);
    store.deleteMoment(momentId);
  },

  async restoreMoment(momentId: string) {
    if (!API_CONFIG.useRemoteApi) {
      store.restoreMoment(momentId);
      return store.getMoment(momentId);
    }
    const result = await momentService.restore(momentId);
    const moment = remoteMoment(result, store.getState().profile.id || result.author_id);
    store.upsertRemoteMoment(moment);
    return moment;
  },

  async trashList() {
    if (!API_CONFIG.useRemoteApi) return store.getState().moments.filter((item) => item.status === "DELETED" && item.author === "我");
    const result = await momentService.trashList();
    return result.map((item) => remoteMoment(item, store.getState().profile.id || item.author_id));
  },

  async timelinePage(from: string, to: string, limit = 20, cursor?: string) {
    if (!API_CONFIG.useRemoteApi) return { items: store.getState().moments, next_cursor: undefined, has_more: false };
    const result = await momentService.timeline(from, to, limit, cursor);
    return {
      ...result,
      items: (result.items || []).map((item: any) => remoteMoment(item, store.getState().profile.id || item.author_id))
    };
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
