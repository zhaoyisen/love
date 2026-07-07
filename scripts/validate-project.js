const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..", "miniprogram");
const failures = [];

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    return entry.isDirectory() ? walk(full) : [full];
  });
}

const files = walk(root);
for (const file of files.filter((item) => item.endsWith(".json"))) {
  try { JSON.parse(fs.readFileSync(file, "utf8")); }
  catch (error) { failures.push(`${path.relative(root, file)}: ${error.message}`); }
}

const app = JSON.parse(fs.readFileSync(path.join(root, "app.json"), "utf8"));
const pages = [...app.pages, ...app.subpackages.flatMap((group) => group.pages.map((page) => `${group.root}/${page}`))];
for (const page of pages) {
  for (const extension of ["ts", "json", "wxml", "wxss"]) {
    const file = path.join(root, `${page}.${extension}`);
    if (!fs.existsSync(file)) failures.push(`missing: ${path.relative(root, file)}`);
  }
}

for (const file of files.filter((item) => item.endsWith(".wxml"))) {
  const source = fs.readFileSync(file, "utf8");
  const htmlOnly = source.match(/<(i|label|small|time)(\s|>)|<\/(i|label|small|time)>/);
  const breakTag = source.match(/<br\s*\/?\s*>/);
  const methodExpression = source.match(/\.(indexOf|find|filter|map)\(/);
  if (htmlOnly) failures.push(`${path.relative(root, file)}: unsupported HTML-style tag ${htmlOnly[0]}`);
  if (breakTag) failures.push(`${path.relative(root, file)}: unsupported break tag ${breakTag[0]}`);
  if (methodExpression) failures.push(`${path.relative(root, file)}: method call in WXML expression ${methodExpression[0]}`);
}

for (const file of files.filter((item) => item.endsWith(".wxss"))) {
  const source = fs.readFileSync(file, "utf8");
  const barePseudoAfterChildCombinator = source.match(/>\s*:[a-z-]+/i);
  if (barePseudoAfterChildCombinator) {
    failures.push(`${path.relative(root, file)}: WXSS requires an explicit selector before ${barePseudoAfterChildCombinator[0].trim()}`);
  }
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`${pages.length} pages and ${files.filter((item) => item.endsWith(".json")).length} JSON files validated.`);
