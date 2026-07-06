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
  baseUrl: envVersion === "develop" ? "http://127.0.0.1:8080/api/v1" : "https://api.example.com/api/v1",
  // 后端联调时改为 true。正式发布前必须同时替换上面的生产域名。
  useRemoteApi: false,
  envVersion,
  stableDevIdentity: envVersion === "develop",
  clientVersion: "0.2.0",
  channel: "WECHAT_MINI"
};
