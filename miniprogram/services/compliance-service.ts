import { apiRequest, idempotencyKey } from "./request";

export type FeedbackCategory = "CONTENT_ISSUE" | "RIGHTS_COMPLAINT" | "PRIVACY_CONCERN" | "MODERATION_APPEAL" | "OTHER";

export const complianceService = {
  submitFeedback(resourceType: string, resourceId: string | null, category: FeedbackCategory, description: string) {
    return apiRequest<any>({
      path: "/feedback",
      method: "POST",
      data: {
        resource_type: resourceType,
        resource_id: resourceId,
        category,
        description
      }
    });
  },

  myFeedback(limit = 20) {
    return apiRequest<any[]>({ path: `/feedback/my?limit=${limit}` });
  },

  latestDeletionRequest() {
    return apiRequest<any>({ path: "/me/deletion-requests/latest" });
  },

  requestAccountDeletion(confirmText: string, reason?: string) {
    return apiRequest<any>({
      path: "/me/deletion-requests",
      method: "POST",
      idempotencyKey: idempotencyKey(),
      data: {
        confirm_text: confirmText,
        reason: reason || null
      }
    });
  },

  deletionStatus(id: string, token: string) {
    return apiRequest<any>({
      path: `/deletion-requests/${id}/status?token=${encodeURIComponent(token)}`,
      public: true
    });
  }
};
