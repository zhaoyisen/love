const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), ts = require('typescript');
function fixture(remote = true) {
  const state = { profile: { name: '小满', defaultVisibility: 'PRIVATE' }, couple: { id: 'pair', status: 'PAIRED', relationshipName: '满屿之间', anniversary: '2026-05-20' }, preferences: { momentNotice: true, reactionNotice: true, petNotice: true, recapNotice: true }, messages: [] };
  const calls = { preferences: [], relations: [], navigation: [], modals: [], toasts: [], resets: 0 }; let page;
  const store = { getState: () => state, updatePreference(key, value) { state.preferences[key] = value; }, reset() { calls.resets++; } };
  const service = { isRemote: remote, async refresh() {}, async updateNotificationPreference(key, value) { calls.preferences.push({ key, value }); }, async updateCoupleProfile(name, anniversary) { calls.relations.push({ name, anniversary }); state.couple.relationshipName = name; state.couple.anniversary = anniversary; } };
  const wx = { navigateTo: value => calls.navigation.push(value), switchTab: value => calls.navigation.push(value), reLaunch: value => calls.navigation.push(value), showModal: value => calls.modals.push(value), showToast: value => calls.toasts.push(value) };
  const file = path.resolve(__dirname, '../miniprogram/pkg-profile/settings/index.ts');
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const deps = { '../../core/api-config': { API_CONFIG: { clientVersion: 'test-version' } }, '../../core/store': { store }, '../../services/app-service': { appService: service, redirectExpiredSession: () => false, userError: (error, fallback) => error.message || fallback } };
  vm.runInNewContext(code, { exports: {}, require(name) { assert.ok(name in deps, name); return deps[name]; }, Page(value) { page = value; }, wx }, { filename: file });
  page.data = structuredClone(page.data); page.setData = function (patch) { Object.assign(this.data, patch); };
  return { page, state, service, calls };
}
const change = (key, value) => ({ currentTarget: { dataset: { key } }, detail: { value } });
test('settings renders saved controls, counts four reminders and keeps disclosure independent of preferences', async () => {
  const f = fixture(); await f.page.onShow(); assert.equal(f.page.data.noticeCount, 4); assert.equal(f.page.data.noticesOpen, false);
  const before = JSON.stringify(f.state.preferences); f.page.toggleNotices(); assert.equal(f.page.data.noticesOpen, true); assert.equal(JSON.stringify(f.state.preferences), before);
});
test('whole-preference saves are serialized and a failure rolls the visible state back', async () => {
  const f = fixture(); await f.page.onShow(); let finish;
  f.service.updateNotificationPreference = () => new Promise(resolve => { finish = resolve; });
  const saving = f.page.toggle(change('momentNotice', false)); assert.equal(f.page.data.savingPreference, true); await f.page.toggle(change('petNotice', false)); assert.equal(f.state.preferences.petNotice, true);
  finish(); await saving; assert.equal(f.page.data.noticeCount, 3);
  f.service.updateNotificationPreference = async () => { throw new Error('离线'); }; await f.page.toggle(change('petNotice', false)); assert.equal(f.state.preferences.petNotice, true); assert.equal(f.page.data.noticeCount, 3); assert.equal(f.page.data.savingPreference, false);
});
test('settings keeps retry and every existing privacy, profile, recycle and account destination', async () => {
  const f = fixture(); f.service.refresh = async () => { throw new Error('同步失败'); }; await f.page.onShow(); assert.equal(f.page.data.loaded, true); assert.equal(f.page.data.state.profile.defaultVisibility, 'PRIVATE'); assert.equal(f.page.data.error, '同步失败');
  f.service.refresh = async () => {}; await f.page.retry(); assert.equal(f.page.data.error, '');
  for (const action of ['edit', 'privacy', 'recycle', 'deleteAccount']) f.page[action]();
  assert.equal(f.calls.navigation.map(item => item.url).join('|'), '/pkg-profile/edit/index|/pkg-couple/privacy/index|/pkg-moment/recycle-bin/index|/pkg-profile/delete-account/index');
  f.page.about(); assert.ok(f.calls.modals.at(-1).content.includes('test-version'));
  f.page.help(); assert.ok(f.calls.modals.at(-1).content.includes('管理分享边界和已删除内容'));
});
test('relationship edit lives in settings and saves trimmed name with a nullable anniversary', async () => {
  const f = fixture(); await f.page.onShow(); f.page.openProfileEditor(); assert.equal(f.page.data.editName, '满屿之间'); assert.equal(f.page.data.editAnniversary, '2026-05-20');
  f.page.nameInput({ detail: { value: '  每一天  ' } }); f.page.clearAnniversary(); await f.page.saveProfile(); assert.equal(f.calls.relations[0].name, '每一天'); assert.equal(f.calls.relations[0].anniversary, null); assert.equal(f.page.data.editing, false);
});
test('relationship save rejects an empty name, duplicate submits and changed spaces', async () => {
  const f = fixture(); await f.page.onShow(); f.page.openProfileEditor(); f.page.nameInput({ detail: { value: '   ' } }); await f.page.saveProfile(); assert.equal(f.calls.relations.length, 0);
  f.page.nameInput({ detail: { value: '新名字' } }); let finish, saves = 0; f.service.updateCoupleProfile = () => { saves++; return new Promise(resolve => { finish = resolve; }); };
  const saving = f.page.saveProfile(); await f.page.saveProfile(); assert.equal(saves, 1); finish(); await saving;
  f.page.openProfileEditor(); f.state.couple.id = 'new-space'; await f.page.saveProfile(); assert.equal(saves, 1);
});
test('relationship save errors preserve the editor and cancelled changes never write', async () => {
  const f = fixture(); await f.page.onShow(); f.page.openProfileEditor(); f.page.closeProfileEditor(); assert.equal(f.calls.relations.length, 0);
  f.page.openProfileEditor(); f.service.updateCoupleProfile = async () => { throw new Error('保存失败'); }; await f.page.saveProfile(); assert.equal(f.page.data.editing, true); assert.equal(f.page.data.savingProfile, false);
  f.state.couple.status = 'UNPAIRED'; f.page.closeProfileEditor(); f.page.openProfileEditor(); assert.equal(f.page.data.editing, false);
});
test('demo reset still requires confirmation and is unavailable against the remote service', async () => {
  const live = fixture(); live.page.reset(); assert.equal(live.calls.modals.length, 0);
  const f = fixture(false); f.page.reset(); assert.equal(f.calls.resets, 0); f.calls.modals.at(-1).success({ confirm: false }); assert.equal(f.calls.resets, 0); f.calls.modals.at(-1).success({ confirm: true }); assert.equal(f.calls.resets, 1); assert.equal(f.calls.navigation.at(-1).url, '/pages/welcome/index');
});
