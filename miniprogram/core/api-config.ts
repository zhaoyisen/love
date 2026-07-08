type MiniProgramEnvironment = "develop" | "trial" | "release";

function environment(): MiniProgramEnvironment {
  try {
    return wx.getAccountInfoSync().miniProgram.envVersion || "develop";
  } catch (_) {
    return "develop";
  }
}

const envVersion = environment();

export const API_CONFIG = {
  // 开发者工具可使用 127.0.0.1；体验版和正式版必须替换成已配置白名单的 HTTPS 域名。
  baseUrl: envVersion === "develop" ? "http://127.0.0.1:8080/api/v1" : "https://love.api.zhaoyisen.com.cn/api/v1",
  // 核心记录闭环已接入真实服务端；只在纯前端演示时临时改为 false。
  useRemoteApi: true,
  envVersion,
  stableDevIdentity: envVersion === "develop",
  clientVersion: "0.2.0",
  channel: "WECHAT_MINI"
};
