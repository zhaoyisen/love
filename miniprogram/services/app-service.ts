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
import { notificationPreferenceService } from "./notification-preference-service";
import { templateName, templateRenderService } from "./template-render-service";
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
    template: item.template?.template_id ? templateName(item.template.template_id) : undefined,
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
    aggregateCount: Number(item.aggregate_count || 1),
    createdAt: shortDateTime(item.created_at),
    read: Boolean(item.read_at),
    momentId: item.moment_id
  };
}

function emptyPet(): AppState["pet"] {
  return { name: "", kind: "", level: 0, growth: 0, fedToday: false, playedToday: false, logs: [], adoptionState: "NOT_STARTED" };
}

function remotePet(item: any): AppState["pet"] {
  const logs = (item.logs || []).map((log: any) => {
    const actor = log.mine ? "我" : "TA";
    const action = log.action === "FEED" ? "给团子喂了小饼干" : "陪团子玩了毛线球";
    return `${shortDateTime(log.created_at)} · ${actor}${action}`;
  });
  return {
    name: item.name || "",
    kind: item.kind || "",
    level: Number(item.level || 0),
    growth: item.growth || 0,
    fedToday: Boolean(item.fed_today),
    playedToday: Boolean(item.played_today),
    logs,
    adoptionState: item.adoption_state || (item.id ? "ADOPTED" : "NOT_STARTED"),
    adoption: item.adoption ? {
      kind: item.adoption.kind,
      name: item.adoption.name,
      proposedByMe: Boolean(item.adoption.proposed_by_me)
    } : undefined,
    renameAvailableAt: item.rename_available_at
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

function remotePreferences(item: any): AppState["preferences"] {
  return {
    momentNotice: item?.moment_notice !== false,
    reactionNotice: item?.reaction_notice !== false,
    petNotice: item?.pet_notice !== false,
    recapNotice: item?.recap_notice !== false
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
  const [couple, timeline, messagePage, preferences] = await Promise.all([
    coupleService.current(),
    momentService.timeline(from, to, 50),
    messageService.list(50),
    notificationPreferenceService.current()
  ]);
  store.applyRemoteCouple(couple);
  const moments = (timeline.items || [])
    .filter((item: any) => item.status !== "TRASHED" && item.status !== "PURGED")
    .map((item: any) => remoteMoment(item, me.id));
  store.replaceRemoteMoments(moments);
  store.replaceRemoteMessages((messagePage.items || []).map(remoteMessage));
  store.applyRemotePreferences(remotePreferences(preferences));
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

  async publish(draftId: string, options: { skipTemplate?: boolean } = {}) {
    const draft = store.getDraft(draftId);
    if (!draft) return undefined;
    if (!API_CONFIG.useRemoteApi) return mockApi.publish(draftId);
    const assetIds = draft.mediaType === "TEXT" ? [] : await uploadDraftMedia(draftId);
    let templateOutput: { renderedAssetId: string; localPath: string; templateName: string } | undefined;
    if (!options.skipTemplate && draft.mediaType === "IMAGE" && draft.template !== "原始照片") {
      templateOutput = await templateRenderService.renderAndRegister(draft, assetIds);
      assetIds.push(templateOutput.renderedAssetId);
    }
    const latestDraft = store.getDraft(draftId) || draft;
    const result = await momentService.create(latestDraft, assetIds);
    const profileId = store.getState().profile.id || result.author_id;
    const moment = remoteMoment(result, profileId);
    moment.media = moment.media.map((item, index) => {
      const localFallback = templateOutput && index === 0 ? templateOutput.localPath : latestDraft.media[index]?.path;
      return { ...item, path: !item.path || String(item.path).startsWith("local://") ? localFallback : item.path };
    });
    if (templateOutput) moment.template = templateOutput.templateName;
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

  async deleteComment(momentId: string, commentId: string) {
    if (!API_CONFIG.useRemoteApi) return store.deleteComment(momentId, commentId);
    const result = await momentService.deleteComment(momentId, commentId);
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

  async proposePetAdoption(kind: string, name: string) {
    const result = await petService.proposeAdoption(kind, name);
    const pet = remotePet(result);
    store.applyRemotePet(pet);
    return pet;
  },

  async confirmPetAdoption() {
    const result = await petService.confirmAdoption();
    const pet = remotePet(result);
    store.applyRemotePet(pet);
    return pet;
  },

  async renamePet(name: string) {
    const result = await petService.rename(name);
    const pet = remotePet(result);
    store.applyRemotePet(pet);
    return pet;
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

  async updateCoupleProfile(relationshipName: string, anniversary: string | null) {
    const normalized = relationshipName.trim();
    if (!normalized) throw new Error("请填写你们的关系昵称。");
    if (!API_CONFIG.useRemoteApi) {
      store.update((state) => { state.couple.relationshipName = normalized; state.couple.anniversary = anniversary || ""; });
      return store.getState().couple;
    }
    const couple = store.getState().couple;
    if (couple.version === undefined) throw new Error("情侣空间状态尚未同步，请返回刷新后重试。");
    const result = await coupleService.update(couple.version, normalized, anniversary);
    store.applyRemoteCouple(result);
    return store.getState().couple;
  },

  async updateNotificationPreference(key: keyof AppState["preferences"], value: boolean) {
    if (!API_CONFIG.useRemoteApi) {
      store.updatePreference(key, value);
      return store.getState().preferences;
    }
    const next = { ...store.getState().preferences, [key]: value };
    const result = await notificationPreferenceService.update({
      moment_notice: next.momentNotice,
      reaction_notice: next.reactionNotice,
      pet_notice: next.petNotice,
      recap_notice: next.recapNotice
    });
    const preferences = remotePreferences(result);
    store.applyRemotePreferences(preferences);
    return preferences;
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
