const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../server/src/main/resources/static/admin/admin-model.js');

test('admin text and media sources cannot inject markup or script URLs', () => {
  assert.equal(model.escape('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
  for (const url of ['javascript:alert(1)', 'data:text/html,hi', 'local://photo', '//evil.test/x', 'https://name:password@example.test/a']) assert.equal(model.mediaUrl(url), '');
  assert.equal(model.mediaUrl('https://cos.example.test/a.jpg?q-signature=demo'), 'https://cos.example.test/a.jpg?q-signature=demo');
});

test('rebuild plan distinguishes known repairable, missing, unapproved and unchecked media', () => {
  const media = [
    {id:'repair',status:'READY',source:'AVAILABLE',display:'AVAILABLE',thumbnail:'MISSING'},
    {id:'lost',status:'READY',source:'MISSING',display:'MISSING',thumbnail:'MISSING'},
    {id:'healthy',status:'READY',source:'AVAILABLE',display:'AVAILABLE',thumbnail:'AVAILABLE'},
    {id:'unapproved',status:'BLOCKED',source:'AVAILABLE',display:'UNSET',thumbnail:'UNSET'},
    {id:'unknown',status:'READY',source:'UNCHECKED',display:'UNCHECKED',thumbnail:'UNSET'},
    {id:'denied',status:'READY',source:'ERROR',display:'ERROR',thumbnail:'ERROR'}
  ];
  const result=model.rebuildPlan([{media}]);
  assert.equal(result.total,6);assert.equal(result.ready,1);assert.equal(result.checkFirst,2);
  assert.deepEqual(result.skipped.map(item=>item.id),['lost','healthy','unapproved']);
});

test('unknown statuses remain explicit rather than claiming a successful check', () => {
  assert.equal(model.issueLabel('UNCHECKED'),'未检查');
  assert.equal(model.issueLabel('CHECK_FAILED'),'检查失败');
  assert.equal(model.stateLabel('ERROR'),'检查失败');
  assert.equal(model.stateLabel(undefined),'未检查');
  assert.equal(model.progress({total:0,completed:0}),0);
  assert.equal(model.progress({total:5,completed:2}),40);
  assert.equal(model.progress({total:5,completed:9}),100);
});
