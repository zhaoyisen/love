const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), ts = require('typescript');

function fixture(author = 'TA', visibility = 'SHARED') {
  const moment = { id: 'moment', author, visibility, title: '一起慢慢走', body: '晚风刚刚好。', occurredAt: '2026-10-15T18:36:00+08:00', mood: '开心', events: ['日常'], mediaType: 'IMAGE', media: [{ id: 'photo', assetId: 'asset', path: 'original', thumbnailPath: 'signed-cover', status: 'READY' }], comments: [], status: 'PUBLISHED', version: 3 };
  const state = { profile: { id: 'me' }, couple: { partnerName: '阿屿' } };
  const calls = { reactions: [], comments: [], toasts: [], navigation: [], modals: [], trash: [] };
  const window = { windowHeight: 700, windowWidth: 375 };
  const service = { isRemote: true, async detail() { return moment; }, async reactMoment(id, value) { calls.reactions.push({ id, value }); return { ...moment, reaction: { actor: '我', value } }; }, async commentMoment(id, body) { calls.comments.push({ id, body }); return { ...moment, comments: [{ id: 'comment', author: '我', body, createdAt: '刚刚' }] }; }, async trashMoment(id, version) { calls.trash.push({ id, version }); } };
  const compile = file => ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText;
  const format = { exports: {} }; vm.runInNewContext(compile(path.resolve(__dirname, '../miniprogram/core/format.ts')), format);
  const deps = { '../../core/store': { store: { getState: () => state, getMoment: () => moment } }, '../../core/media-cache': { mediaCache: { get: () => 'cached-cover' } }, '../../core/format': format.exports, '../../services/app-service': { appService: service, redirectExpiredSession: () => false, userError: (error, fallback) => error.message || fallback } };
  let page;
  const wx = { getWindowInfo: () => window, getSystemInfoSync: () => window, showToast: value => calls.toasts.push(value), navigateTo: value => calls.navigation.push(value), showModal: value => calls.modals.push(value), showLoading() {}, hideLoading() {}, navigateBack() {} };
  vm.runInNewContext(compile(path.resolve(__dirname, '../miniprogram/pkg-moment/detail/index.ts')), { exports: {}, require: name => deps[name], Page: value => { page = value; }, wx, setTimeout: () => 1, clearTimeout() {} });
  page.data = structuredClone(page.data); page.setData = function (patch, done) { Object.assign(this.data, patch); if (done) done(); }; page.onLoad({ id: 'moment' });
  return { page, moment, service, calls, window };
}
const reaction = value => ({ currentTarget: { dataset: { value } } });

test('only the other viewer of a shared record can submit one of the six responses', async () => {
  for (const [author, visibility] of [['我', 'SHARED'], ['我', 'PRIVATE'], ['TA', 'PRIVATE']]) {
    const f = fixture(author, visibility); await f.page.refresh(); await f.page.react(reaction('心动')); assert.equal(f.calls.reactions.length, 0);
  }
  const f = fixture(); await f.page.refresh(); await f.page.react(reaction('未知回应')); assert.equal(f.calls.reactions.length, 0);
  await f.page.react(reaction('抱抱')); assert.equal(f.calls.reactions.length, 1); assert.equal(f.page.data.moment.reactionValue, '抱抱');
});

test('response saving prevents duplicate submissions and keeps the last response on failure', async () => {
  const f = fixture(); await f.page.refresh(); let finish;
  f.service.reactMoment = () => new Promise(resolve => { finish = resolve; });
  const saving = f.page.react(reaction('心动')); assert.equal(f.page.data.reactionSaving, true);
  await f.page.react(reaction('抱抱')); finish({ ...f.moment, reaction: { actor: '我', value: '心动' } }); await saving;
  f.service.reactMoment = async () => { throw new Error('离线'); }; await f.page.react(reaction('抱抱'));
  assert.equal(f.page.data.moment.reactionValue, '心动'); assert.equal(f.page.data.reactionSaving, false); assert.equal(f.calls.toasts.at(-1).title, '离线');
});

test('a failed short comment keeps its draft; retry creates the first visible comment and clears the input', async () => {
  const f = fixture('我'); await f.page.refresh(); f.page.commentInput({ detail: { value: '  回来的路上也很开心  ' } });
  const send = f.service.commentMoment; f.service.commentMoment = async () => { throw new Error('断网'); }; await f.page.sendComment();
  assert.equal(f.page.data.commentText, '  回来的路上也很开心  '); assert.equal(f.page.data.moment.comments.length, 0); assert.equal(f.page.data.commentSending, false);
  f.service.commentMoment = send; await f.page.sendComment(); assert.equal(f.page.data.moment.comments.length, 1); assert.equal(f.page.data.moment.comments[0].body, '回来的路上也很开心'); assert.equal(f.page.data.commentText, '');
});

test('private records do not send comments and an in-flight send cannot be repeated', async () => {
  const privateRecord = fixture('我', 'PRIVATE'); await privateRecord.page.refresh(); privateRecord.page.commentInput({ detail: { value: '私密正文' } }); await privateRecord.page.sendComment(); assert.equal(privateRecord.calls.comments.length, 0);
  const f = fixture(); await f.page.refresh(); f.page.commentInput({ detail: { value: '给你的话' } }); let finish, sent = 0;
  f.service.commentMoment = () => { sent++; return new Promise(resolve => { finish = resolve; }); };
  const saving = f.page.sendComment(); await f.page.sendComment(); assert.equal(sent, 1); finish({ ...f.moment, comments: [{ id: 'one', body: '给你的话' }] }); await saving; assert.equal(f.page.data.commentSending, false);
});

test('the fixed input follows the keyboard without double-counting a resized viewport and resets on blur', () => {
  const f = fixture(); f.page.keyboardChange({ detail: { height: 300 } }); assert.equal(f.page.data.keyboardOffset, 300);
  f.window.windowHeight = 400; f.page.onResize({ size: f.window }); assert.equal(f.page.data.keyboardOffset, 0);
  f.page.commentBlur(); assert.equal(f.page.data.keyboardOffset, 0); assert.equal(f.page.data.keyboardHeight, 0);
  f.page.keyboardChange({ detail: { height: -8 } }); assert.equal(f.page.data.keyboardOffset, 0);
});

test('input focus keeps the pre-keyboard baseline when resize arrives before the height event', () => {
  const f = fixture(); f.page.commentFocus(); f.window.windowHeight = 400; f.page.onResize({ size: f.window });
  f.page.keyboardChange({ detail: { height: 300 } }); assert.equal(f.page.data.keyboardOffset, 0);
  f.page.commentBlur(); f.window.windowHeight = 600; f.page.onResize({ size: f.window });
  f.page.commentFocus(); f.page.keyboardChange({ detail: { height: 240 } }); assert.equal(f.page.data.keyboardOffset, 240);
});

test('refresh preserves cached video covers and exposes failed media retry only to the author', async () => {
  const f = fixture('我'); f.moment.media[0].status = 'FAILED'; await f.page.refresh();
  assert.equal(f.page.data.moment.media[0].thumbnailPath, 'cached-cover'); assert.equal(f.page.data.failedMediaIds.join(), 'asset');
  f.moment.author = 'TA'; await f.page.refresh(); assert.equal(f.page.data.failedMediaIds.length, 0);
});

test('existing management routes and versioned trash confirmation remain available', async () => {
  const f = fixture('我'); await f.page.refresh(); f.page.menu(); f.page.menuEdit(); assert.equal(f.calls.navigation[0].url, '/pkg-moment/edit/index?id=moment');
  f.page.menuPrivacy(); assert.equal(f.calls.navigation[1].url, '/pkg-couple/privacy/index'); f.page.menuTrash(); assert.equal(f.page.data.showTrashConfirm, true);
  f.page.cancelTrash(); assert.equal(f.calls.trash.length, 0); f.page.menuTrash(); await f.page.confirmTrash(); assert.equal(f.calls.trash[0].version, 3); assert.equal(f.page.data.showTrashConfirm, false);
});
