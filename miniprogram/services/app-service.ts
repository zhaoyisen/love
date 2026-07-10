import { API_CONFIG } from "../core/api-config";
import { mockApi } from "../core/mock-api";
import { store } from "../core/store";
import type { AppState, MessageItem, Moment } from "../core/types";
import { authService } from "./auth-service";
import { complianceService, type FeedbackCategory } from "./compliance-service";
import { coupleService } from "./couple-service";
import { mediaService } from "./media-service";
import { messageService } from "./message-service";
import { momentService } from "./moment-service";
import { petService } from "./pet-service";
import { recapService } from "./recap-service";
import { clearTokens, hasSession } from "./request";

const moodLabels: Record<string, string> = {
  HAPPY: "开心", HEARTBEAT: "心动", CALM: "平静", MISS: "想念",
  WRONGED: "委屈", ANGRY: "生气", RECONCILED: "和好", OTHER: "其他"
};

const eventLabels: Record<string, string> = {
  DAILY: "日常", DATE: "约会", TRAVEL: "旅行", ANNIVERSARY: "纪念日",
  FIRST: "第一次", CONFLICT: "争执", RECONCILED: "和好", GIFT: "礼物",
  GROWTH: "共同成长", OTHER: "其他"
};

function shortDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "刚刚";
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}

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
    reaction: item.my_reaction ? { actor: "我", value: item.my_reaction.value } : undefined,
    comments: (item.comments || []).map((comment: any) => ({
      id: comment.id,
      author: comment.author_id === currentUserId ? "我" : "TA",
      body: comment.body || "",
      createdAt: shortDateTime(comment.created_at)
    })),
    status: item.status === "TRASHED" ? "DELETED" : item.status,
    version: item.version,
    deletedAt: item.deleted_at
  };
}

function remoteMessage(item: any): MessageItem {
  return {
    id: item.id,
    type: (item.type || "SYSTEM") as MessageItem["type"],
    title: item.title || "新的消息",
    summary: item.summary || "",
    createdAt: shortDateTime(item.created_at),
    read: Boolean(item.read_at),
    momentId: item.moment_id
  };
}

function emptyPet(): AppState["pet"] {
  return { name: "团子", kind: "云朵猫", level: 1, growth: 0, fedToday: false, playedToday: false, logs: [] };
}

function remotePet(item: any): AppState["pet"] {
  const logs = (item.logs || []).map((log: any) => {
    const actor = log.mine ? "我" : "TA";
    const action = log.action === "FEED" ? "给团子喂了小饼干" : "陪团子玩了毛线球";
    return `${shortDateTime(log.created_at)} · ${actor}${action}`;
  });
  return {
    name: item.name || "团子",
    kind: item.kind || "云朵猫",
    level: item.level || 1,
    growth: item.growth || 0,
    fedToday: Boolean(item.fed_today),
    playedToday: Boolean(item.played_today),
    logs
  };
}

function remoteRecap(item: any): AppState["recap"] {
  const year = item.year || new Date().getFullYear();
  return {
    title: item.title || `我们的 ${year}`,
    year,
    selectedMomentIds: item.selected_moment_ids || [],
    status: item.status === "READY" ? "READY" : "DRAFT",
    version: item.version || 1
  };
}

function applyRecapPayload(item: any) {
  const profileId = store.getState().profile.id || "";
  const selectedMoments = (item.selected_moments || []).map((moment: any) => remoteMoment(moment, profileId));
  if (selectedMoments.length) store.appendRemoteMoments(selectedMoments);
  const recap = remoteRecap(item);
  store.applyRemoteRecap(recap);
  return { recap, selectedMoments, candidateCount: item.candidate_count || 0, excludedCount: item.excluded_count || 0 };
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
  const [couple, timeline, messagePage] = await Promise.all([
    coupleService.current(),
    momentService.timeline(from, to, 50),
    messageService.list(50)
  ]);
  store.applyRemoteCouple(couple);
  const moments = (timeline.items || [])
    .filter((item: any) => item.status !== "TRASHED" && item.status !== "PURGED")
    .map((item: any) => remoteMoment(item, me.id));
  store.replaceRemoteMoments(moments);
  store.replaceRemoteMessages((messagePage.items || []).map(remoteMessage));
  if (couple && couple.status === "PAIRED") {
    store.applyRemotePet(remotePet(await petService.current()));
  } else {
    store.applyRemotePet(emptyPet());
  }
  return { from, to, nextCursor: timeline.next_cursor || "", hasMore: Boolean(timeline.has_more) };
}

export function userError(error: any, fallback = "操作没有完成，请稍后重试。") {
  if (error && typeof error.message === "string" && error.message.trim()) return error.message;
  return fallback;
}

export function isContentBlocked(error: any): boolean {
  return Boolean(error && error.code === "CONTENT_BLOCKED");
}

export function promptModerationAppeal(error: any, description: string, resourceType = "OTHER", resourceId: string | null = null): boolean {
  if (!isContentBlocked(error)) return false;
  wx.showModal({
    title: "内容安全申诉",
    content: "内容未通过安全检测。你可以先修改后重试，也可以提交申诉给人工复核。",
    confirmText: "提交申诉",
    cancelText: "先修改",
    success: async (res: any) => {
      if (!res.confirm) return;
      try {
        if (API_CONFIG.useRemoteApi) {
          await complianceService.submitFeedback(resourceType, resourceId, "MODERATION_APPEAL",
            `内容安全申诉：${description}`.slice(0, 500));
        }
        wx.showToast({ title: "申诉已提交", icon: "none" });
      } catch (appealError) {
        if (!redirectExpiredSession()) wx.showToast({ title: userError(appealError, "申诉提交失败，请稍后重试。"), icon: "none" });
      }
    }
  });
  return true;
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

  async reactMoment(momentId: string, value: string) {
    if (!API_CONFIG.useRemoteApi) {
      store.react(momentId, value);
      return store.getMoment(momentId);
    }
    const result = await momentService.react(momentId, value);
    const moment = remoteMoment(result, store.getState().profile.id || result.author_id);
    store.upsertRemoteMoment(moment);
    return moment;
  },

  async commentMoment(momentId: string, body: string) {
    if (!API_CONFIG.useRemoteApi) {
      store.comment(momentId, body);
      return store.getMoment(momentId);
    }
    const result = await momentService.comment(momentId, body);
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

  async messages() {
    if (!API_CONFIG.useRemoteApi) return store.getState().messages;
    const result = await messageService.list(50);
    const messages = (result.items || []).map(remoteMessage);
    store.replaceRemoteMessages(messages);
    return messages;
  },

  async readMessage(messageId: string) {
    if (!API_CONFIG.useRemoteApi) {
      store.markMessageRead(messageId);
      return;
    }
    await messageService.read(messageId);
    store.markMessageRead(messageId);
  },

  async readAllMessages() {
    if (!API_CONFIG.useRemoteApi) {
      store.markMessagesRead();
      return;
    }
    await messageService.readAll();
    store.markMessagesRead();
  },

  async pet() {
    if (!API_CONFIG.useRemoteApi) return store.getState().pet;
    const result = await petService.current();
    const pet = remotePet(result);
    store.applyRemotePet(pet);
    return pet;
  },

  async petAction(action: "feed" | "play") {
    if (!API_CONFIG.useRemoteApi) {
      const changed = store.petAction(action);
      return { changed, growthDelta: changed ? 8 : 0, pet: store.getState().pet };
    }
    const result = await petService.action(action);
    const pet = remotePet(result.pet);
    store.applyRemotePet(pet);
    return { changed: Boolean(result.changed), growthDelta: result.growth_delta || 0, pet };
  },

  async recap(year = new Date().getFullYear()) {
    if (!API_CONFIG.useRemoteApi) return { recap: store.getState().recap, selectedMoments: [], candidateCount: 0, excludedCount: 0 };
    const result = await recapService.current(year);
    return applyRecapPayload(result);
  },

  async recapCandidates(year = new Date().getFullYear()) {
    if (!API_CONFIG.useRemoteApi) {
      const state = store.getState();
      return { items: state.moments.filter((item) => item.status === "PUBLISHED" && item.visibility === "SHARED"), excludedCount: 0 };
    }
    const result = await recapService.candidates(year);
    const profileId = store.getState().profile.id || "";
    const items = (result.items || []).map((item: any) => remoteMoment(item, profileId));
    store.appendRemoteMoments(items);
    return { items, excludedCount: result.excluded_count || 0 };
  },

  async updateRecap(title: string, selectedMomentIds: string[], year = new Date().getFullYear()) {
    if (!API_CONFIG.useRemoteApi) {
      store.updateRecap(title, selectedMomentIds);
      return store.getState().recap;
    }
    const result = await recapService.update(year, title, selectedMomentIds);
    return applyRecapPayload(result).recap;
  },

  async generateRecap(year = new Date().getFullYear()) {
    if (!API_CONFIG.useRemoteApi) {
      store.finishRecap();
      return store.getState().recap;
    }
    const result = await recapService.generate(year);
    return applyRecapPayload(result).recap;
  },

  async submitFeedback(resourceType: string, resourceId: string | null, category: FeedbackCategory, description: string) {
    if (!API_CONFIG.useRemoteApi) {
      return { id: `local_${Date.now()}`, status: "OPEN" };
    }
    return complianceService.submitFeedback(resourceType, resourceId, category, description);
  },

  async latestDeletionRequest() {
    if (!API_CONFIG.useRemoteApi) return null;
    return complianceService.latestDeletionRequest();
  },

  async requestAccountDeletion(confirmText: string, reason?: string) {
    if (!API_CONFIG.useRemoteApi) {
      clearTokens();
      store.reset();
      return { request: { id: `local_${Date.now()}`, status: "PENDING", requested_at: new Date().toISOString() }, status_token: "local" };
    }
    const result = await complianceService.requestAccountDeletion(confirmText, reason);
    clearTokens();
    store.reset();
    return result;
  },

  async deletionStatus(id: string, token: string) {
    if (!API_CONFIG.useRemoteApi) return null;
    return complianceService.deletionStatus(id, token);
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
