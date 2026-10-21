const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const miniRoot = path.join(projectRoot, "miniprogram");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(projectRoot, relativePath), "utf8");
}

function requireMatch(relativePath, pattern, message) {
  if (!pattern.test(read(relativePath))) failures.push(`${relativePath}: ${message}`);
}

const app = JSON.parse(read("miniprogram/app.json"));
const allPages = [
  ...app.pages,
  ...app.subpackages.flatMap((group) => group.pages.map((page) => `${group.root}/${page}`))
];

if (app.usingComponents?.["privacy-consent"] !== "/components/privacy-consent/index") {
  failures.push("miniprogram/app.json: 必须全局注册隐私授权组件");
}
if (!allPages.includes("pkg-profile/agreement/index")) {
  failures.push("miniprogram/app.json: 必须提供用户协议和隐私说明页面");
}

requireMatch("miniprogram/core/api-config.ts", /envVersion\s*===\s*["']develop["'][\s\S]*https:\/\/[a-z0-9.-]+\/api\/v1/i, "体验版和正式版 API 必须使用 HTTPS 域名");
requireMatch("miniprogram/core/api-config.ts", /useRemoteApi:\s*true/, "生产代码必须启用真实 API");
requireMatch("miniprogram/app.ts", /getUpdateManager\(\)/, "必须在启动时处理小程序版本更新");
requireMatch("miniprogram/app.ts", /onNeedPrivacyAuthorization/, "必须响应微信隐私授权事件");
requireMatch("miniprogram/services/client-monitor.ts", /getRealtimeLogManager/, "必须接入微信实时日志用于生产错误排查");
requireMatch("miniprogram/pkg-compose/preview/index.wxml", /<swiper[\s\S]*wx:for="\{\{draft\.media\}\}"/, "发布前必须能预览全部照片");
requireMatch("miniprogram/pkg-compose/composer/index.wxml", /<swiper[\s\S]*wx:for="\{\{draft\.media\}\}"/, "同页发布流程必须能预览全部照片");
requireMatch("miniprogram/pkg-moment/detail/index.wxml", /<swiper[\s\S]*wx:for="\{\{moment\.media\}\}"/, "详情页必须能查看全部照片");
requireMatch("miniprogram/pkg-compose/composer/index.ts", /IMAGE_MAX_BYTES\s*=\s*20\s*\*\s*1024\s*\*\s*1024/, "客户端图片大小限制必须与服务端一致");
requireMatch("miniprogram/pkg-compose/composer/index.ts", /VIDEO_MAX_BYTES\s*=\s*200\s*\*\s*1024\s*\*\s*1024/, "客户端视频大小限制必须与服务端一致");
requireMatch("server/src/main/resources/application-prod.yml", /rate-limit:[\s\S]*enabled:\s*\$\{RATE_LIMIT_ENABLED:true\}/, "生产环境必须默认启用接口限流");
requireMatch("docker-compose.yml", /env_file:\s*\n\s*-\s*\$\{APP_ENV_FILE:-\.\/\.env\}/, "容器部署必须完整传入服务器 env 文件");
requireMatch("server/.env.example", /^RATE_LIMIT_ENABLED=true$/m, "生产环境变量模板必须默认启用接口限流");
requireMatch("server/src/main/resources/db/migration/V18__media_duration.sql", /duration_seconds/, "服务端必须保存视频时长元数据");

if (/<video\b/.test(read("miniprogram/components/moment-card/index.wxml"))) {
  failures.push("miniprogram/components/moment-card/index.wxml: 时间线列表不能直接创建视频播放器");
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name === "vendor") return [];
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const sourceFiles = walk(miniRoot).filter((file) => /\.(ts|js|json|wxml)$/.test(file));
const secretPattern = /(?:COS_SECRET_(?:ID|KEY)|SECRET_ID|SECRET_KEY)\s*[:=]\s*["'][^"']{8,}["']/i;
for (const file of sourceFiles) {
  if (secretPattern.test(fs.readFileSync(file, "utf8"))) {
    failures.push(`${path.relative(projectRoot, file)}: 小程序包内不得包含 COS 长期密钥`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Production readiness checks passed: HTTPS release API, privacy flow, update handling, media guards, multi-photo display, and client secret scan.");
