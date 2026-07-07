import { apiRequest, idempotencyKey } from "./request";
import type { Draft } from "../core/types";

const moodMap: Record<string, string> = { 开心: "HAPPY", 心动: "HEARTBEAT", 平静: "CALM", 想念: "MISS", 委屈: "WRONGED", 生气: "ANGRY", 和好: "RECONCILED", 其他: "OTHER" };
const eventMap: Record<string, string> = { 日常: "DAILY", 约会: "DATE", 旅行: "TRAVEL", 纪念日: "ANNIVERSARY", 第一次: "FIRST", 争执: "CONFLICT", 和好: "RECONCILED", 礼物: "GIFT", 共同成长: "GROWTH", 其他: "OTHER" };

export const momentService = {
  create(draft: Draft, assetIds: string[] = []) {
    return apiRequest<any>({
      path: "/moments", method: "POST", idempotencyKey: idempotencyKey(),
      data: {
        type: draft.mediaType, title: draft.title || null, body: draft.body,
        occurred_at: draft.occurredAt, visibility: draft.visibility,
        mood: moodMap[draft.mood] || null,
        events: draft.events.map((item) => eventMap[item]).filter(Boolean),
        asset_ids: assetIds
      }
    });
  },
  detail: (id: string) => apiRequest<any>({ path: `/moments/${id}` }),
  update(id: string, version: number, draft: Pick<Draft, "title" | "body" | "occurredAt" | "visibility" | "mood" | "events">) {
    return apiRequest<any>({
      path: `/moments/${id}`,
      method: "PATCH",
      data: {
        version,
        title: draft.title || null,
        body: draft.body,
        occurred_at: draft.occurredAt,
        visibility: draft.visibility,
        mood: moodMap[draft.mood] || null,
        events: draft.events.map((item) => eventMap[item]).filter(Boolean)
      }
    });
  },
  trash: (id: string, version: number) => apiRequest<void>({ path: `/moments/${id}?version=${version}`, method: "DELETE" }),
  restore: (id: string) => apiRequest<any>({ path: `/moments/${id}/restore`, method: "POST" }),
  trashList: () => apiRequest<any[]>({ path: "/moments/trash" }),
  timeline: (from: string, to: string, limit = 20, cursor?: string) => apiRequest<any>({ path: `/timeline?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&limit=${limit}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}` })
};
