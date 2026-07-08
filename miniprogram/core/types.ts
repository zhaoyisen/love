export type Visibility = "PRIVATE" | "SHARED";
export type MediaType = "TEXT" | "IMAGE" | "VIDEO";
export type ViewType = "day" | "week" | "month" | "year" | "custom";

export interface MediaItem {
  id: string;
  type: MediaType;
  path?: string;
  thumbnailPath?: string;
  fileName?: string;
  mimeType?: string;
  size?: number;
  assetId?: string;
  uploadSessionId?: string;
  error?: string;
  tone?: "sunset" | "lake" | "berry" | "paper";
  progress: number;
  status: "READY" | "UPLOADING" | "PROCESSING" | "FAILED";
}

export interface CommentItem {
  id: string;
  author: "我" | "TA";
  body: string;
  createdAt: string;
}

export interface Moment {
  id: string;
  author: "我" | "TA";
  title: string;
  body: string;
  occurredAt: string;
  mood: string;
  events: string[];
  visibility: Visibility;
  mediaType: MediaType;
  media: MediaItem[];
  template?: string;
  reaction?: { actor: "我" | "TA"; value: string };
  comments: CommentItem[];
  status: "PUBLISHED" | "UPLOADING" | "PARTIAL_FAILED" | "DELETED";
  version?: number;
  deletedAt?: string;
}

export interface Draft {
  id: string;
  step: number;
  mediaType: MediaType;
  media: MediaItem[];
  title: string;
  body: string;
  mood: string;
  events: string[];
  occurredAt: string;
  visibility: Visibility;
  template: string;
  updatedAt: string;
}

export interface MessageItem {
  id: string;
  type: "MOMENT" | "REACTION" | "COMMENT" | "PET" | "SYSTEM";
  title: string;
  summary: string;
  createdAt: string;
  read: boolean;
  momentId?: string;
}

export interface AppState {
  schemaVersion: number;
  loggedIn: boolean;
  consented: boolean;
  profile: { id?: string; name: string; avatarText: string; defaultVisibility: Visibility };
  couple: {
    id?: string;
    version?: number;
    status: "UNPAIRED" | "PAIRED" | "ENDED";
    partnerName: string;
    relationshipName: string;
    anniversary: string;
    pairedAt?: string;
  };
  moments: Moment[];
  drafts: Draft[];
  messages: MessageItem[];
  pet: {
    name: string;
    kind: string;
    level: number;
    growth: number;
    fedToday: boolean;
    playedToday: boolean;
    logs: string[];
  };
  recap: {
    title: string;
    year: number;
    selectedMomentIds: string[];
    status: "DRAFT" | "READY";
    version: number;
  };
  preferences: {
    momentNotice: boolean;
    reactionNotice: boolean;
    petNotice: boolean;
    recapNotice: boolean;
  };
}
