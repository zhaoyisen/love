import { apiRequest } from "./request";

export const messageService = {
  list: (limit = 50) => apiRequest<any>({ path: `/messages?limit=${limit}` }),
  read: (id: string) => apiRequest<any>({ path: `/messages/${id}/read`, method: "POST" }),
  readAll: () => apiRequest<any>({ path: "/messages/read-all", method: "POST" })
};
