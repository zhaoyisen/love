const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "miniprogram");
const failures = [];

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function requirePattern(relativePath, pattern, message) {
  if (!pattern.test(read(relativePath))) failures.push(`${relativePath}: ${message}`);
}

requirePattern("custom-tab-bar/index.wxss", /\.tab-list\s*\{[^}]*display:\s*flex/s, "五槽主导航必须使用稳定的 Flex 容器");
requirePattern("custom-tab-bar/index.wxss", /\.tab-item\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*0/s, "页面入口必须等宽且允许在五槽中收缩");
requirePattern("custom-tab-bar/index.wxss", /\.compose-slot\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*0/s, "中央记录入口必须占据独立的第三槽");
requirePattern("custom-tab-bar/index.wxss", /\.compose-button\s*\{[^}]*top:\s*10rpx[^}]*width:\s*92rpx[^}]*height:\s*92rpx/s, "中央记录按钮必须限制在第三槽内，不能覆盖相邻导航");
requirePattern("pages-main/time/index.wxss", /\.memory-tabs-inner\s*\{[^}]*display:\s*inline-flex/s, "甜蜜动态的时间切换必须使用可横向滚动 Flex");
requirePattern("pkg-compose/composer/index.wxss", /\.media-type-grid\s*\{[^}]*display:\s*flex/s, "媒体类型必须使用 Flex");
requirePattern("pkg-compose/composer/index.wxss", /\.capture-type\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*0[^}]*min-width:\s*0/s, "单页记录器的媒体按钮必须等宽并允许收缩");
requirePattern("pkg-compose/composer/index.wxss", /\.media-grid\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s, "媒体列表必须使用可换行 Flex");
requirePattern("pkg-compose/composer/index.wxss", /\.compose-page\s*\{[^}]*position:\s*fixed[^}]*display:\s*flex[^}]*flex-direction:\s*column/s, "记录流程必须使用固定屏高的 Flex 容器");
requirePattern("pkg-compose/composer/index.wxss", /\.compose-main\s*\{[^}]*flex:\s*1[^}]*min-height:\s*0[^}]*overflow:\s*hidden/s, "当前步骤必须在预留操作栏的区域内收缩");
requirePattern("pkg-compose/composer/index.wxss", /\.compose-actions\s*\{[^}]*flex:\s*0 0 auto[^}]*safe-area-inset-bottom/s, "固定操作栏必须保留安全区且不覆盖填写区域");
if (!JSON.parse(read("pkg-compose/composer/index.json")).disableScroll) failures.push("记录页必须禁用外层页面滚动");
requirePattern("pages-main/mine/index.wxss", /\.edit-button\s*\{[^}]*width:\s*72px\s*!important[^}]*max-width:\s*72px\s*!important/s, "个人资料编辑按钮必须锁定可读宽度，避免挤压昵称");
requirePattern("pages-main/mine/index.wxml", /wx:if="\{\{noticesOpen\}\}"[^>]*id="notice-options"/, "提醒设置必须在当前页按需展开");

const composerTemplate = read("pkg-compose/composer/index.wxml");
if (!/stage moment-editor/.test(composerTemplate) || !/stage preview-stage/.test(composerTemplate) || !/bindtap="publish"/.test(composerTemplate) || !/id="templateRenderCanvas"/.test(composerTemplate)) {
  failures.push("pkg-compose/composer/index.wxml: 同页记录器必须包含编辑、预览、发布和模板画布");
}

const tabTemplate = read("custom-tab-bar/index.wxml");
if ((tabTemplate.match(/class="tab-item/g) || []).length !== 4 || !/class="compose-slot"/.test(tabTemplate)) {
  failures.push("custom-tab-bar/index.wxml: 主导航必须包含四个页面热区和一个中央记录槽");
}

// Custom TabBar renders outside page, so the homepage variant must resolve its own tokens.
const homeTokens = new Map([...read("styles/home-refined.wxss").matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((match) => [match[1], match[2]]));
const refinedTab = read("custom-tab-bar/index.wxss").split(".tab-shell--refined {")[1];
const pendingTokens = [...(refinedTab || "").matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]);
const checkedTokens = new Set();
while (pendingTokens.length) {
  const token = pendingTokens.pop();
  if (checkedTokens.has(token)) continue;
  checkedTokens.add(token);
  const value = homeTokens.get(token);
  if (value === undefined) failures.push(`custom-tab-bar/index.wxss: 首页导航缺少独立 token ${token}，不能依赖 page 继承`);
  else pendingTokens.push(...[...value.matchAll(/var\((--[\w-]+)/g)].map((match) => match[1]));
}

for (const file of fs.readdirSync(root, { recursive: true }).filter((item) => item.endsWith(".wxss"))) {
  const source = read(file);
  const percentageWidths = [...source.matchAll(/width:\s*(\d+(?:\.\d+)?)%/g)].map((match) => Number(match[1]));
  if (percentageWidths.some((value) => value > 100)) failures.push(`${file}: 存在超过 100% 的固定百分比宽度`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}

console.log("Responsive layout checks passed for navigation, timeline, composer, and media grids.");
