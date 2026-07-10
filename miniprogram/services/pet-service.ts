import { apiRequest, idempotencyKey } from "./request";

const actionMap: Record<string, "FEED" | "PLAY"> = { feed: "FEED", play: "PLAY" };

export const petService = {
  current: () => apiRequest<any>({ path: "/pet/current" }),
  action: (action: "feed" | "play") => apiRequest<any>({
    path: "/pet/current/actions",
    method: "POST",
    idempotencyKey: idempotencyKey(),
    data: { action: actionMap[action] }
  })
};
