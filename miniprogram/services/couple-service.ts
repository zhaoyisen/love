import { apiRequest, idempotencyKey } from "./request";

export const coupleService = {
  current: () => apiRequest<any>({ path: "/couples/current" }),
  createInvitation: () => apiRequest<any>({ path: "/couple-invitations", method: "POST", idempotencyKey: idempotencyKey() }),
  previewInvitation: (token: string) => apiRequest<any>({ path: `/couple-invitations/${token}/preview`, public: true }),
  acceptInvitation: (token: string) => apiRequest<any>({ path: `/couple-invitations/${token}/accept`, method: "POST", data: { rules_confirmed: true }, idempotencyKey: idempotencyKey() }),
  unbind: (version: number, confirmText: string) => apiRequest<any>({ path: "/couples/current/unbind", method: "POST", data: { version, confirm_text: confirmText }, idempotencyKey: idempotencyKey() })
};
