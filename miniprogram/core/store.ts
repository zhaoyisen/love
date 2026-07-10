import type { AppState, Draft, Moment, Visibility } from "./types";
import { API_CONFIG } from "./api-config";

const STORAGE_KEY = API_CONFIG.useRemoteApi ? "love-notes:remote-state:v1" : "love-notes:mock-state:v1";
const LEGACY_STORAGE_KEY = "love-notes:mvp-state:v1";

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
}

function initialState(): AppState {
  const state: AppState = {
    schemaVersion: 1,
    loggedIn: false,
    consented: false,
    profile: { name: "小满", avatarText: "满", defaultVisibility: "PRIVATE" },
    couple: {
      status: "UNPAIRED",
      partnerName: "阿屿",
      relationshipName: "满屿之间",
      anniversary: "2024-05-20"
    },
    moments: [
      {
        id: "moment_101",
        author: "我",
        title: "下班后的一小段晚风",
        body: "没有特别安排，只是在河边慢慢走了一圈。普通的一天也值得被记住。",
        occurredAt: "2026-07-02T19:26:00+08:00",
        mood: "平静",
        events: ["日常"],
        visibility: "PRIVATE",
        mediaType: "IMAGE",
        media: [{ id: "media_101", type: "IMAGE", tone: "sunset", progress: 100, status: "READY" }],
        template: "奶油胶片",
        comments: [],
        status: "PUBLISHED"
      },
      {
        id: "moment_102",
        author: "TA",
        title: "雨天的临时约会",
        body: "计划被雨打乱了，但临时找到的小店很好吃。",
        occurredAt: "2026-06-21T15:08:00+08:00",
        mood: "开心",
        events: ["约会", "日常"],
        visibility: "SHARED",
        mediaType: "IMAGE",
        media: [{ id: "media_102", type: "IMAGE", tone: "lake", progress: 100, status: "READY" }],
        reaction: { actor: "我", value: "心动" },
        comments: [{ id: "comment_1", author: "我", body: "雨天也很好看。", createdAt: "2026-06-21 18:20" }],
        status: "PUBLISHED"
      },
      {
        id: "moment_103",
        author: "我",
        title: "把今天的不开心放在这里",
        body: "不是为了分出对错，只想先记下自己的感受，等情绪过去再聊。",
        occurredAt: "2026-05-18T23:10:00+08:00",
        mood: "委屈",
        events: ["争执"],
        visibility: "PRIVATE",
        mediaType: "TEXT",
        media: [],
        comments: [],
        status: "PUBLISHED"
      }
    ],
    drafts: [],
    messages: [
      { id: "msg_1", type: "REACTION", title: "TA 回应了你的时刻", summary: "在「下班后的一小段晚风」留下了抱抱", createdAt: "19:42", read: false, momentId: "moment_101" },
      { id: "msg_2", type: "PET", title: "团子长大了一点", summary: "共同互动为团子增加了 8 点成长值", createdAt: "昨天", read: true }
    ],
    pet: {
      name: "团子",
      kind: "云朵猫",
      level: 3,
      growth: 64,
      fedToday: false,
      playedToday: false,
      logs: ["昨天 · TA 陪团子玩了一会儿", "06-30 · 你们共同记录了一个时刻"]
    },
    recap: {
      title: "我们的 2026",
      year: 2026,
      selectedMomentIds: ["moment_101", "moment_102"],
      status: "DRAFT",
      version: 1
    },
    preferences: { momentNotice: true, reactionNotice: true, petNotice: true, recapNotice: true }
  };
  if (API_CONFIG.useRemoteApi) {
    state.profile = { name: "微信用户", avatarText: "微", defaultVisibility: "PRIVATE" };
    state.couple = { status: "UNPAIRED", partnerName: "TA", relationshipName: "我们的空间", anniversary: "" };
    state.moments = [];
    state.messages = [];
    state.pet = { name: "团子", kind: "云朵猫", level: 1, growth: 0, fedToday: false, playedToday: false, logs: [] };
    state.recap = { title: `我们的 ${new Date().getFullYear()}`, year: new Date().getFullYear(), selectedMomentIds: [], status: "DRAFT", version: 1 };
  }
  return state;
}

class LoveNotesStore {
  private state: AppState = initialState();

  initialize() {
    try {
      const saved = wx.getStorageSync(STORAGE_KEY) || (!API_CONFIG.useRemoteApi ? wx.getStorageSync(LEGACY_STORAGE_KEY) : undefined);
      if (saved && saved.schemaVersion === 1) { this.state = saved; this.persist(); }
    } catch (_) {
      this.state = initialState();
    }
  }

  getState(): AppState {
    return this.state;
  }

  private persist() {
    wx.setStorageSync(STORAGE_KEY, this.state);
  }

  update(mutator: (draft: AppState) => void) {
    mutator(this.state);
    this.persist();
  }

  login() {
    this.update((state) => {
      state.loggedIn = true;
      state.consented = true;
    });
  }

  applyRemoteProfile(profile: { id: string; name: string }) {
    this.update((state) => {
      state.loggedIn = true;
      state.consented = true;
      state.profile.id = profile.id;
      state.profile.name = profile.name || "微信用户";
      state.profile.avatarText = (profile.name || "微").slice(0, 1);
    });
  }

  applyRemoteCouple(couple: any | null) {
    this.update((state) => {
      if (!couple) {
        state.couple = {
          status: "UNPAIRED",
          partnerName: "TA",
          relationshipName: "我们的空间",
          anniversary: ""
        };
        return;
      }
      state.couple.id = couple.id;
      state.couple.version = couple.version;
      state.couple.status = couple.status === "PAIRED" ? "PAIRED" : "ENDED";
      state.couple.partnerName = "TA";
      state.couple.relationshipName = couple.relationship_name || "我们的空间";
      state.couple.anniversary = couple.anniversary || "";
    });
  }

  replaceRemoteMoments(moments: Moment[]) {
    this.update((state) => { state.moments = moments; });
  }

  appendRemoteMoments(moments: Moment[]) {
    this.update((state) => {
      const incoming = new Set(moments.map((item) => item.id));
      state.moments = [...state.moments.filter((item) => !incoming.has(item.id)), ...moments];
    });
  }

  replaceRemoteMessages(messages: AppState["messages"]) {
    this.update((state) => { state.messages = messages; });
  }

  applyRemotePet(pet: AppState["pet"]) {
    this.update((state) => { state.pet = pet; });
  }

  applyRemoteRecap(recap: AppState["recap"]) {
    this.update((state) => { state.recap = recap; });
  }

  upsertRemoteMoment(moment: Moment) {
    this.update((state) => {
      state.moments = [moment, ...state.moments.filter((item) => item.id !== moment.id)];
    });
  }

  publishRemoteDraft(draftId: string, moment: Moment) {
    this.update((state) => {
      state.moments = [moment, ...state.moments.filter((item) => item.id !== moment.id)];
      state.drafts = state.drafts.filter((item) => item.id !== draftId);
    });
  }

  pair() {
    this.update((state) => {
      state.couple.status = "PAIRED";
      state.couple.pairedAt = nowIso();
      state.messages.unshift({
        id: createId("msg"), type: "SYSTEM", title: "情侣空间已建立",
        summary: "旧记录仍保持原来的可见范围", createdAt: "刚刚", read: false
      });
    });
  }

  unpair() {
    this.update((state) => {
      state.couple.status = "ENDED";
      state.moments = state.moments.filter((item) => item.author === "我");
      state.pet.logs.unshift("刚刚 · 情侣空间已结束，宠物停止互动");
      state.messages.unshift({
        id: createId("msg"), type: "SYSTEM", title: "情侣空间已停止访问",
        summary: "你仍可查看自己创建的记录", createdAt: "刚刚", read: false
      });
    });
  }

  createDraft(mediaType: Draft["mediaType"] = "IMAGE"): Draft {
    const draft: Draft = {
      id: createId("draft"), step: 1, mediaType, media: [], title: "", body: "",
      mood: "开心", events: ["日常"], occurredAt: nowIso(),
      visibility: this.state.couple.status === "PAIRED" ? this.state.profile.defaultVisibility : "PRIVATE",
      template: "奶油胶片", updatedAt: nowIso()
    };
    this.update((state) => state.drafts.unshift(draft));
    return draft;
  }

  getDraft(id: string) {
    return this.state.drafts.find((item) => item.id === id);
  }

  saveDraft(id: string, patch: Partial<Draft>) {
    this.update((state) => {
      const draft = state.drafts.find((item) => item.id === id);
      if (draft) Object.assign(draft, patch, { updatedAt: nowIso() });
    });
  }

  publishDraft(id: string): Moment | undefined {
    let result: Moment | undefined;
    this.update((state) => {
      const draft = state.drafts.find((item) => item.id === id);
      if (!draft) return;
      result = {
        id: createId("moment"), author: "我", title: draft.title || "一个普通却想记住的时刻",
        body: draft.body, occurredAt: draft.occurredAt, mood: draft.mood, events: draft.events,
        visibility: state.couple.status === "PAIRED" ? draft.visibility : "PRIVATE",
        mediaType: draft.mediaType, media: draft.media.map((item) => ({ ...item, progress: 100, status: "READY" })),
        template: draft.template, comments: [], status: "PUBLISHED"
      };
      state.moments.unshift(result);
      state.drafts = state.drafts.filter((item) => item.id !== id);
      if (state.couple.status === "PAIRED") state.pet.growth = Math.min(99, state.pet.growth + 6);
    });
    return result;
  }

  getMoment(id: string) {
    return this.state.moments.find((item) => item.id === id && item.status !== "DELETED");
  }

  react(momentId: string, value: string) {
    this.update((state) => {
      const moment = state.moments.find((item) => item.id === momentId);
      if (moment) moment.reaction = { actor: "我", value };
    });
  }

  comment(momentId: string, body: string) {
    this.update((state) => {
      const moment = state.moments.find((item) => item.id === momentId);
      if (moment) moment.comments.push({ id: createId("comment"), author: "我", body, createdAt: "刚刚" });
    });
  }

  deleteMoment(momentId: string) {
    this.update((state) => {
      const moment = state.moments.find((item) => item.id === momentId);
      if (moment) { moment.status = "DELETED"; moment.deletedAt = nowIso(); }
    });
  }

  editMoment(momentId: string, patch: Partial<Moment>) {
    this.update((state) => {
      const moment = state.moments.find((item) => item.id === momentId);
      if (moment) Object.assign(moment, patch, { version: (moment.version || 0) + 1 });
    });
    return this.getMoment(momentId);
  }

  restoreMoment(momentId: string) {
    this.update((state) => {
      const moment = state.moments.find((item) => item.id === momentId);
      if (moment) { moment.status = "PUBLISHED"; delete moment.deletedAt; }
    });
  }

  petAction(action: "feed" | "play") {
    let changed = false;
    this.update((state) => {
      const key = action === "feed" ? "fedToday" : "playedToday";
      if (state.pet[key]) return;
      state.pet[key] = true;
      state.pet.growth = Math.min(99, state.pet.growth + 8);
      state.pet.logs.unshift(`刚刚 · 我${action === "feed" ? "给团子喂了小饼干" : "陪团子玩了毛线球"}`);
      changed = true;
    });
    return changed;
  }

  markMessagesRead() {
    this.update((state) => state.messages.forEach((item) => item.read = true));
  }

  markMessageRead(id: string) {
    this.update((state) => {
      const message = state.messages.find((item) => item.id === id);
      if (message) message.read = true;
    });
  }

  updatePreference(key: keyof AppState["preferences"], value: boolean) {
    this.update((state) => { state.preferences[key] = value; });
  }

  updateProfileName(nickname: string) {
    this.update((state) => {
      state.profile.name = nickname;
      state.profile.avatarText = nickname.slice(0, 1) || "我";
    });
  }

  updateDefaultVisibility(value: Visibility) {
    this.update((state) => { state.profile.defaultVisibility = value; });
  }

  updateRecap(title: string, selectedMomentIds: string[]) {
    this.update((state) => {
      state.recap.title = title;
      state.recap.selectedMomentIds = selectedMomentIds;
      state.recap.version += 1;
      state.recap.status = "DRAFT";
    });
  }

  finishRecap() {
    this.update((state) => { state.recap.status = "READY"; });
  }

  reset() {
    this.state = initialState();
    this.persist();
  }
}

export const store = new LoveNotesStore();
