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
requirePattern("pkg-compose/composer/index.wxss", /\.media-grid\.is-empty \.add-media\s*\{[^}]*width:\s*100%[^}]*height:\s*142rpx/s, "未选择媒体时必须使用紧凑的全宽添加入口");
requirePattern("pkg-compose/composer/index.wxss", /\.preview-heart\s*\{[^}]*position:\s*relative[^}]*width:\s*100%/s, "记录页的预览操作必须占满内容区并保持在正常文档流中");
if (/\.preview-heart\s*\{[^}]*position:\s*fixed/s.test(read("pkg-compose/composer/index.wxss"))) {
  failures.push("pkg-compose/composer/index.wxss: 记录页预览按钮不能固定悬浮遮挡表单内容");
}
requirePattern("pages-main/mine/index.wxss", /\.edit-button\s*\{[^}]*width:\s*124rpx\s*!important[^}]*max-width:\s*124rpx\s*!important/s, "个人资料编辑按钮必须锁定宽度，避免挤压昵称");

const composerTemplate = read("pkg-compose/composer/index.wxml");
if (!/class="moment-editor"/.test(composerTemplate) || !/class="preview-heart press"/.test(composerTemplate)) {
  failures.push("pkg-compose/composer/index.wxml: 单页记录器必须同时包含内容编辑区和发布预览入口");
}

const tabTemplate = read("custom-tab-bar/index.wxml");
if ((tabTemplate.match(/class="tab-item/g) || []).length !== 4 || !/class="compose-slot"/.test(tabTemplate)) {
  failures.push("custom-tab-bar/index.wxml: 主导航必须包含四个页面热区和一个中央记录槽");
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
