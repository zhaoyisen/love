const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function load(relativePath, dependencies, globals = {}) {
  const filename = path.resolve(__dirname, "..", relativePath);
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }
  }).outputText;
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    require(name) {
      assert.ok(Object.hasOwn(dependencies, name), `Unexpected dependency: ${name}`);
      return dependencies[name];
    },
    ...globals
  }, { filename });
  return exports;
}

function invitationPage(currentCouple) {
  const wx = { getStorageSync: () => undefined, setStorageSync() {} };
  const { store } = load("miniprogram/core/store.ts", {
    "./api-config": { API_CONFIG: { useRemoteApi: true } }
  }, { wx });
  store.applyRemoteProfile({ id: "me", name: "我" });
  store.applyRemoteCouple({ id: "old-space", status: "PAIRED", relationship_name: "旧空间" });
  let page;
  load("miniprogram/pkg-couple/invite/index.ts", {
    "../../core/store": { store },
    "../../services/app-service": {
      appService: {
        isRemote: true,
        createInvitation: async () => ({ token: "new-invitation", expires_at: new Date(Date.now() + 3600000).toISOString() })
      },
      redirectExpiredSession: () => false,
      userError: (error) => error.message
    },
    "../../services/couple-service": { coupleService: { current: currentCouple } }
  }, { wx, Page(definition) { page = definition; } });
  page.setData = function (patch) { Object.assign(this.data, patch); };
  return { page, store };
}

test("partner unbinding releases a cached paired account to create a new invitation", async () => {
  const { page, store } = invitationPage(async () => null);
  await page.onLoad({});
  assert.equal(store.getState().couple.status, "UNPAIRED");
  assert.equal(page.data.stage, "create");
  await page.create();
  assert.equal(page.data.stage, "waiting");
  assert.equal(page.data.token, "new-invitation");
});

test("an active relationship still shows its existing space", async () => {
  const { page } = invitationPage(async () => ({ id: "active-space", status: "PAIRED", relationship_name: "当前空间" }));
  await page.onLoad({});
  assert.equal(page.data.stage, "done");
  assert.equal(page.data.relationshipName, "当前空间");
});

test("a failed relationship refresh reports the error and preserves the cached state", async () => {
  const { page, store } = invitationPage(async () => { throw new Error("网络连接失败"); });
  await page.onLoad({});
  assert.equal(page.data.error, "网络连接失败");
  assert.equal(page.data.loading, false);
  assert.equal(store.getState().couple.id, "old-space");
});
