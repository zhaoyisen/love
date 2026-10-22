import { apiRequest, idempotencyKey } from "./request";

export const coupleService = {
  current: () => apiRequest<any>({ path: "/couples/current" }),
  albumPhotos: () => apiRequest<any[]>({ path: "/couples/current/album-photos" }),
  albumCapacity: () => apiRequest<{ used: number }>({ path: "/couples/current/album-capacity" }),
  reorderAlbumPhotos: (coupleId: string, version: number, assetIds: string[]) => apiRequest<{ asset_ids: string[]; version: number }>({
    path: "/couples/current/album-order", method: "PUT", data: { couple_id: coupleId, version, asset_ids: assetIds }
  }),
  deleteAlbumPhoto: (coupleId: string, assetId: string) => apiRequest<void>({
    path: `/couples/current/album-photos/${encodeURIComponent(assetId)}?couple_id=${encodeURIComponent(coupleId)}`, method: "DELETE"
  }),
  addAlbumPhotos: (coupleId: string, assetIds: string[]) => apiRequest<any[]>({
    path: "/couples/current/album-photos", method: "POST", data: { couple_id: coupleId, asset_ids: assetIds }
  }),
  update: (version: number, relationshipName: string, anniversary: string | null) => apiRequest<any>({
    path: "/couples/current", method: "PATCH",
    data: { version, relationship_name: relationshipName, anniversary: anniversary || null }
  }),
  createInvitation: () => apiRequest<any>({ path: "/couple-invitations", method: "POST", idempotencyKey: idempotencyKey() }),
  previewInvitation: (token: string) => apiRequest<any>({ path: `/couple-invitations/${token}/preview`, public: true }),
  acceptInvitation: (token: string) => apiRequest<any>({ path: `/couple-invitations/${token}/accept`, method: "POST", data: { rules_confirmed: true }, idempotencyKey: idempotencyKey() }),
  unbind: (version: number, confirmText: string) => apiRequest<any>({ path: "/couples/current/unbind", method: "POST", data: { version, confirm_text: confirmText }, idempotencyKey: idempotencyKey() })
};
