import { API_CONFIG } from "../core/api-config";
import { mediaCache } from "../core/media-cache";
import { reportClientIssue } from "./client-monitor";

const ACCESS_TOKEN_KEY = "love-notes:access-token";
const REFRESH_TOKEN_KEY = "love-notes:refresh-token";
let refreshPromise: Promise<boolean> | null = null;

interface Envelope<T> { data: T; meta: { request_id: string; server_time: string } }
interface ErrorEnvelope { error?: { code?: string; user_message?: string; request_id?: string; details?: { retry_after?: number } } }

export interface RequestOptions {
  path: string;
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  data?: any;
  public?: boolean;
  idempotencyKey?: string;
}

function rawRequest<T>(options: any): Promise<any> {
  return new Promise((resolve, reject) => wx.request({ timeout: 12000, ...options, success: resolve, fail: reject }));
}

export async function apiRequest<T>(options: RequestOptions, allowRefresh = true): Promise<T> {
  const token = wx.getStorageSync(ACCESS_TOKEN_KEY);
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Request-Id": `mini_${Date.now()}_${Math.random().toString(16).slice(2)}`,
    "Client-Channel": API_CONFIG.channel,
    "Client-Version": API_CONFIG.clientVersion,
    "Device-Id": deviceId()
  };
  if (!options.public && token) headers.Authorization = `Bearer ${token}`;
  if (options.idempotencyKey) headers["Idempotency-Key"] = options.idempotencyKey;

  let response: any;
  try {
    response = await rawRequest<Envelope<T>>({ url: `${API_CONFIG.baseUrl}${options.path}`, method: options.method || "GET", data: options.data, header: headers });
  } catch (_) {
    reportClientIssue("API_NETWORK_ERROR", { method: options.method || "GET" });
    const exception: any = new Error("网络连接失败，请检查网络后重试。");
    exception.code = "NETWORK_ERROR";
    throw exception;
  }
  if (response.statusCode >= 200 && response.statusCode < 300) {
    const body = response.data;
    if (response.statusCode === 204 || body === undefined || body === null || body === "") return undefined as T;
    if (typeof body === "object" && Object.prototype.hasOwnProperty.call(body, "data")) return (body as Envelope<T>).data;
    return body as T;
  }
  if (response.statusCode === 401 && allowRefresh && !options.public && await refreshSession()) return apiRequest<T>(options, false);
  if (response.statusCode === 401 && !options.public) clearTokens();
  const error = response.data as ErrorEnvelope;
  const retryAfter = Number(error.error?.details?.retry_after || response.header?.["Retry-After"] || 0);
  const rateLimitedMessage = retryAfter > 0 ? `操作太频繁，请 ${retryAfter} 秒后再试。` : "操作太频繁，请稍后再试。";
  const exception: any = new Error(error.error?.code === "RATE_LIMITED" ? rateLimitedMessage : (error.error?.user_message || "服务暂时不可用，请稍后重试。"));
  exception.code = error.error?.code || "REQUEST_FAILED";
  exception.requestId = error.error?.request_id;
  exception.retryAfter = retryAfter;
  if (response.statusCode >= 500) reportClientIssue("API_SERVER_ERROR", { statusCode: response.statusCode, code: exception.code, requestId: exception.requestId });
  throw exception;
}

export function saveTokens(accessToken: string, refreshToken: string) {
  wx.setStorageSync(ACCESS_TOKEN_KEY, accessToken);
  wx.setStorageSync(REFRESH_TOKEN_KEY, refreshToken);
}

export function clearTokens() {
  mediaCache.clear();
  wx.removeStorageSync(ACCESS_TOKEN_KEY);
  wx.removeStorageSync(REFRESH_TOKEN_KEY);
}

export function hasSession(): boolean {
  return Boolean(wx.getStorageSync(ACCESS_TOKEN_KEY) && wx.getStorageSync(REFRESH_TOKEN_KEY));
}

async function refreshSession(): Promise<boolean> {
  if (refreshPromise) return refreshPromise;
  refreshPromise = (async () => {
    const refreshToken = wx.getStorageSync(REFRESH_TOKEN_KEY);
    if (!refreshToken) return false;
    try {
      const response = await rawRequest<any>({ url: `${API_CONFIG.baseUrl}/auth/refresh`, method: "POST", data: { refresh_token: refreshToken }, header: { "Content-Type": "application/json" } });
      if (response.statusCode < 200 || response.statusCode >= 300) { clearTokens(); return false; }
      saveTokens(response.data.data.access_token, response.data.data.refresh_token);
      return true;
    } catch (_) { return false; }
  })();
  try { return await refreshPromise; } finally { refreshPromise = null; }
}

function deviceId(): string {
  const key = "love-notes:device-id";
  let value = wx.getStorageSync(key);
  if (!value) { value = `mini_${Date.now()}_${Math.random().toString(16).slice(2)}`; wx.setStorageSync(key, value); }
  return value;
}

export function idempotencyKey(): string {
  return `idem_${Date.now()}_${Math.random().toString(16).slice(2)}_${Math.random().toString(16).slice(2)}`;
}
