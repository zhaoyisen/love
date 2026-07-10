import { apiRequest, idempotencyKey } from "./request";

const actionMap: Record<string, "FEED" | "PLAY"> = { feed: "FEED", play: "PLAY" };

export const petService = {
  current: () => apiRequest<any>({ path: "/pet/current" }),
  proposeAdoption: (kind: string, name: string) => apiRequest<any>({
    path: "/pet/adoption-proposals", method: "POST", data: { kind, name }
  }),
  confirmAdoption: () => apiRequest<any>({ path: "/pet/adoption-proposals/confirm", method: "POST" }),
  rename: (name: string) => apiRequest<any>({ path: "/pet/current/rename", method: "POST", data: { name } }),
  action: (action: "feed" | "play") => apiRequest<any>({
    path: "/pet/current/actions",
    method: "POST",
    idempotencyKey: idempotencyKey(),
    data: { action: actionMap[action] }
  })
};
