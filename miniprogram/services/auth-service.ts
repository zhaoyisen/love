import { apiRequest, saveTokens } from "./request";

export interface LoginResponse {
  user_id: string;
  nickname: string;
  access_token: string;
  refresh_token: string;
  expires_in: number;
}

function wechatCode(): Promise<string> {
  return new Promise((resolve, reject) => wx.login({ success: (result: any) => result.code ? resolve(result.code) : reject(new Error("微信登录失败")), fail: reject }));
}

export const authService = {
  async login(): Promise<LoginResponse> {
    const code = await wechatCode();
    const result = await apiRequest<LoginResponse>({ path: "/auth/wechat/session", method: "POST", data: { code }, public: true });
    saveTokens(result.access_token, result.refresh_token);
    return result;
  },
  me: () => apiRequest<any>({ path: "/me" })
};
