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

interface CosUploadFailureDetails {
  code?: string;
  message?: string;
  requestId?: string;
  statusCode?: number;
}

function nonBlankText(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function cosUploadFailureDetails(error: any): CosUploadFailureDetails {
  const providerError = error && typeof error.error === "object" ? error.error : undefined;
  const statusValue = providerError?.statusCode ?? error?.statusCode;
  const statusCode = typeof statusValue === "number"
    ? statusValue
    : (typeof statusValue === "string" && /^\d+$/.test(statusValue) ? Number(statusValue) : undefined);
  return {
    code: nonBlankText(providerError?.Code)
      || nonBlankText(providerError?.code)
      || nonBlankText(error?.Code)
      || nonBlankText(error?.code),
    message: nonBlankText(providerError?.Message)
      || nonBlankText(providerError?.message)
      || nonBlankText(providerError?.errMsg)
      || nonBlankText(error?.message)
      || nonBlankText(error?.errMsg)
      || nonBlankText(error?.error),
    requestId: nonBlankText(providerError?.RequestId)
      || nonBlankText(providerError?.requestId)
      || nonBlankText(error?.RequestId)
      || nonBlankText(error?.requestId),
    statusCode
  };
}

function cosUploadError(error: any, session: UploadSessionResponse): Error {
  const details = cosUploadFailureDetails(error);
  const evidence = `${details.code || ""} ${details.message || ""}`.toLowerCase();
  const cosDomain = `https://${session.bucket}.cos.${session.region}.myqcloud.com`;
  let userMessage: string;

  if (evidence.includes("domain list") || evidence.includes("合法域名") || evidence.includes("url not in domain")) {
    userMessage = `COS 上传域名未加入微信 request 合法域名：${cosDomain}`;
  } else if (evidence.includes("request has expired") || evidence.includes("requesttime") || evidence.includes("expired")) {
    userMessage = "COS 上传签名已过期，请检查服务器时间同步后重新选择图片。";
  } else if (details.statusCode === 401 || details.statusCode === 403 || evidence.includes("accessdenied")) {
    const requestId = details.requestId ? `，请求 ID：${details.requestId}` : "";
    userMessage = `COS 拒绝上传，请检查临时密钥权限${details.code ? `（${details.code}）` : ""}${requestId}。`;
  } else if (evidence.includes("timeout") || evidence.includes("network") || evidence.includes("request:fail")) {
    userMessage = "连接 COS 上传服务失败，请检查网络后重试。";
  } else {
    const reason = details.code || details.message || (details.statusCode ? `HTTP ${details.statusCode}` : "未知错误");
    userMessage = `媒体上传失败：${reason}`;
  }

  // 只输出可公开的诊断字段，避免把临时密钥或签名写入日志。
  console.error("COS upload failed", {
    code: details.code,
    message: details.message,
    requestId: details.requestId,
    statusCode: details.statusCode,
    bucket: session.bucket,
    region: session.region
  });
  // COS is uploaded directly from the Mini Program, so report only safe diagnostic
  // fields back to the API. Never send the temporary key, token or authorization data.
  void apiRequest<{ accepted: boolean }>({
    path: "/media-diagnostics/cos-upload-failures",
    method: "POST",
    data: {
      upload_session_id: session.upload_session_id,
      status_code: details.statusCode,
      provider_code: details.code,
      provider_message: details.message,
      provider_request_id: details.requestId
    }
  }).catch(() => undefined);
  const uploadError: any = new Error(userMessage);
  uploadError.code = details.code || "COS_UPLOAD_FAILED";
  uploadError.requestId = details.requestId;
  uploadError.statusCode = details.statusCode;
  return uploadError;
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
        reject(cosUploadError(error, session));
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
