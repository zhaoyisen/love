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

requirePattern("custom-tab-bar/index.wxss", /\.tab-list\s*\{[^}]*display:\s*flex/s, "主导航必须使用 Flex，避免安卓 Grid 溢出");
requirePattern("custom-tab-bar/index.wxss", /\.tab-item\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*0[^}]*min-width:\s*0/s, "主导航项必须等分且允许收缩");
requirePattern("pages-main/time/index.wxss", /\.view-tabs-inner\s*\{[^}]*display:\s*flex/s, "时间视图切换必须使用 Flex");
requirePattern("pages-main/time/index.wxss", /\.view-tab\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*0[^}]*min-width:\s*0/s, "时间视图按钮必须等宽并允许收缩");
requirePattern("pkg-compose/composer/index.wxss", /\.media-type-grid\s*\{[^}]*display:\s*flex/s, "媒体类型必须使用 Flex");
requirePattern("pkg-compose/composer/index.wxss", /\.media-type\s*\{[^}]*flex:\s*1 1 0[^}]*width:\s*0[^}]*min-width:\s*0/s, "媒体类型按钮必须等宽并允许收缩");
requirePattern("pkg-compose/composer/index.wxss", /\.media-grid\s*\{[^}]*display:\s*flex[^}]*flex-wrap:\s*wrap/s, "媒体列表必须使用可换行 Flex");

const composerTemplate = read("pkg-compose/composer/index.wxml");
const stepNumbers = composerTemplate.match(/class="step-number"/g) || [];
if (stepNumbers.length !== 3) failures.push("pkg-compose/composer/index.wxml: 三个流程编号必须独立使用 step-number 样式");

const tabTemplate = read("custom-tab-bar/index.wxml");
if (/compose-space/.test(tabTemplate)) failures.push("custom-tab-bar/index.wxml: 三项导航不应保留额外占位列");

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
