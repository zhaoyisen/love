import { apiRequest } from "./request";

export interface NotificationPreferencesResponse {
  moment_notice: boolean;
  reaction_notice: boolean;
  pet_notice: boolean;
  recap_notice: boolean;
}

export const notificationPreferenceService = {
  current: () => apiRequest<NotificationPreferencesResponse>({ path: "/me/notification-preferences" }),
  update: (value: NotificationPreferencesResponse) => apiRequest<NotificationPreferencesResponse>({
    path: "/me/notification-preferences", method: "PATCH", data: value
  })
};
