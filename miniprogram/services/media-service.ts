import type { MediaItem } from "../core/types";
import { apiRequest } from "./request";

const COS = require("../vendor/cos-wx-sdk-v5.min.js");

interface UploadSessionResponse {
  asset_id: string;
  upload_session_id: string;
  bucket: string;
  region: string;
  key: string;
  provider: "LOCAL" | "COS";
  credentials?: {
    tmp_secret_id: string;
    tmp_secret_key: string;
    session_token: string;
    start_time: number;
    expired_time: number;
  };
}

interface AssetResponse {
  id: string;
  kind: "IMAGE" | "VIDEO";
  status: "PROCESSING" | "READY" | "BLOCKED" | "FAILED";
  access_url?: string;
  thumbnail_url?: string;
}

function uploadToCos(session: UploadSessionResponse, file: MediaItem, onProgress: (progress: number) => void): Promise<string | undefined> {
  const credentials = session.credentials;
  if (!credentials || !file.path) return Promise.reject(new Error("上传凭证不完整，请重新申请。"));
  const cos = new COS({
    SecretId: credentials.tmp_secret_id,
    SecretKey: credentials.tmp_secret_key,
    SecurityToken: credentials.session_token,
    StartTime: credentials.start_time,
    ExpiredTime: credentials.expired_time,
    SimpleUploadMethod: "putObject"
  });
  return new Promise((resolve, reject) => {
    cos.uploadFile({
      Bucket: session.bucket,
      Region: session.region,
      Key: session.key,
      FilePath: file.path,
      FileSize: file.size,
      SliceSize: 5 * 1024 * 1024,
      onProgress: (info: any) => {
        const value = typeof info.percent === "number"
          ? Math.round(info.percent * 100)
          : Math.round(((info.loaded || 0) / Math.max(1, info.total || file.size || 1)) * 100);
        onProgress(Math.max(1, Math.min(99, value)));
      }
    }, (error: any, data: any) => {
      if (error) {
        reject(new Error(error.error || error.message || "媒体上传失败，请重试。"));
        return;
      }
      const headers = (data && (data.headers || data.header)) || {};
      resolve(headers.etag || headers.ETag);
    });
  });
}

export const mediaService = {
  createUploadSession(fileName: string, mimeType: string, size: number, sha256?: string) {
    return apiRequest<UploadSessionResponse>({ path: "/upload-sessions", method: "POST", data: { file_name: fileName, mime_type: mimeType, size, sha256 } });
  },
  completeUpload(sessionId: string, etag?: string) {
    return apiRequest<AssetResponse>({ path: `/upload-sessions/${sessionId}/complete`, method: "POST", data: { etag } });
  },
  asset: (assetId: string) => apiRequest<AssetResponse>({ path: `/media-assets/${assetId}` }),
  accessUrl: (assetId: string) => apiRequest<{ url: string }>({ path: `/media-assets/${assetId}/access-url` }),

  async upload(file: MediaItem, onProgress: (progress: number) => void) {
    if (!file.path || !file.fileName || !file.mimeType || !file.size) throw new Error("媒体文件信息不完整，请重新选择。 ");
    const session = await this.createUploadSession(file.fileName, file.mimeType, file.size);
    let etag: string | undefined;
    if (session.provider === "COS") etag = await uploadToCos(session, file, onProgress);
    const asset = await this.completeUpload(session.upload_session_id, etag);
    return { session, asset };
  }
};
