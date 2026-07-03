import { apiRequest } from "./request";

export const mediaService = {
  createUploadSession(fileName: string, mimeType: string, size: number, sha256?: string) {
    return apiRequest<any>({ path: "/upload-sessions", method: "POST", data: { file_name: fileName, mime_type: mimeType, size, sha256 } });
  },
  completeUpload(sessionId: string, etag?: string) {
    return apiRequest<any>({ path: `/upload-sessions/${sessionId}/complete`, method: "POST", data: { etag } });
  },
  asset: (assetId: string) => apiRequest<any>({ path: `/media-assets/${assetId}` })
};
