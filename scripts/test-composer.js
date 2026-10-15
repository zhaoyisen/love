const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');
const ts = require('typescript');

function load(relative, dependencies, globals = {}) {
  const exports = {};
  const filename = path.resolve(__dirname, '..', relative);
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(source, {exports, require(name) { assert.ok(name in dependencies,name); return dependencies[name]; }, ...globals}, {filename});
  return exports;
}
const templates = load('miniprogram/services/template-render-service.ts', {'./request':{}, './media-service':{}});
const event = (key, value) => ({currentTarget:{dataset:{[key]:value}}});
function fixture(patch = {}, paired = true) {
  let draft = {id:'draft',step:1,mediaType:'IMAGE',media:[],title:'',body:'',mood:'开心',events:['日常'],occurredAt:'2026-10-14T10:20:00+08:00',visibility:paired?'SHARED':'PRIVATE',template:'奶油胶片',...patch};
  const state = {couple:{status:paired?'PAIRED':'UNPAIRED'}};
  const calls = {saved:[],navigation:[],toasts:[],modals:[],appeals:[],publish:[],hidden:0};
  const timers = new Map(); let nextTimer = 0; let page;
  const store = {getState:()=>state,getDraft:()=>draft,createDraft:()=>draft,saveDraft(id,patch){assert.equal(id,'draft');calls.saved.push(structuredClone(patch));draft={...draft,...patch};}};
  const service = {isRemote:true,async publish(id,options){calls.publish.push({id,options});draft=undefined;return{id:'moment'};}};
  const templateService = {...templates,renderTemplatePreview:async()=> 'wxfile://template.jpg'};
  let expired = false;
  const wx = {getWindowInfo:()=>({windowWidth:375,windowHeight:700}),getSystemInfoSync:()=>({windowWidth:375,windowHeight:700}),hideKeyboard(){calls.hidden++;},
    showToast(value){calls.toasts.push(value);},showModal(value){calls.modals.push(value);},showActionSheet(value){calls.sheet=value;},
    navigateTo(value){calls.navigation.push(value);},navigateBack(){calls.navigation.push({back:true});},reLaunch(value){calls.navigation.push(value);},
    chooseMedia(value){value.success({tempFiles:[{tempFilePath:'wxfile://photo.jpg',size:1000}]});},getFileSystemManager:()=>({statSync:()=>({size:1000})})};
  load('miniprogram/pkg-compose/composer/index.ts',{'../../core/store':{store},'../../services/template-render-service':templateService,
    '../../services/app-service':{appService:service,redirectExpiredSession:()=>expired,userError:(error,fallback)=>error.message||fallback,promptModerationAppeal:(...args)=>calls.appeals.push(args)}},
    {Page(value){page=value;},wx,setTimeout(fn,delay){timers.set(++nextTimer,{fn,delay});return nextTimer;},clearTimeout(id){timers.delete(id);},setInterval(fn,delay){timers.set(++nextTimer,{fn,delay,interval:true});return nextTimer;},clearInterval(id){timers.delete(id);}});
  page.data=structuredClone(page.data); page.setData=function(patch){Object.assign(this.data,patch);};
  page.onLoad({draftId:'draft'});page.onShow();
  return {page,calls,state,service,templateService,wx,timers,store,expire(){expired=true;},run(delay){for(const [id,item]of [...timers])if(item.delay===delay){if(!item.interval)timers.delete(id);item.fn();}}};
}
const photo = {id:'photo',type:'IMAGE',path:'wxfile://photo.jpg',fileName:'photo.jpg',status:'READY',progress:100};

test('reopened incomplete drafts resume at the first unfinished stage',()=>{
  assert.equal(fixture({step:4}).page.data.step,1);
  assert.equal(fixture({step:4,media:[photo]}).page.data.step,2);
  assert.equal(fixture({step:4,mediaType:'TEXT',body:'正文'}).page.data.step,4);
});

test('four stages validate media and content, save on transition, and never navigate to preview or layout routes',async()=>{
  const {page,calls}=fixture();page.next();assert.equal(page.data.step,1);
  await page.chooseMedia();page.next();assert.equal(page.data.step,2);
  page.next();assert.equal(page.data.step,2);
  page.bodyInput({detail:{value:'一起喝杯咖啡'}});page.next();assert.equal(page.data.step,3);
  page.toggleEvent(event('value','约会'));page.next();assert.equal(page.data.step,4);
  page.previous();assert.equal(page.data.step,3);assert.equal(page.data.draft.body,'一起喝杯咖啡');
  page.next();await page.beautify();assert.equal(page.data.showLayout,true);page.closeLayout();assert.equal(page.data.showLayout,false);
  assert.equal(calls.navigation.length,0);assert.equal(calls.saved.at(-1).events.length,2);
});
test('autosave stores all rapid edits and hiding flushes a complete draft',()=>{
  const f=fixture();f.page.titleInput({detail:{value:'晚风和你'}});f.page.bodyInput({detail:{value:'正文'}});f.page.selectMood(event('value','心动'));f.run(3000);
  const saved=f.calls.saved.at(-1);assert.equal(saved.title,'晚风和你');assert.equal(saved.body,'正文');assert.equal(saved.mood,'心动');
  f.page.bodyInput({detail:{value:'修改正文'}});f.page.onHide();assert.equal(f.calls.saved.at(-1).body,'修改正文');assert.equal(f.timers.size,0);
});
test('discard restores the opening snapshot and unload cannot overwrite it',()=>{
  const f=fixture({title:'原始标题'});f.page.titleInput({detail:{value:'新标题'}});f.page.exit();f.calls.sheet.success({tapIndex:1});f.page.onHide();f.page.onUnload();f.run(3000);
  assert.equal(f.store.getDraft('draft').title,'原始标题');assert.equal(f.calls.navigation.at(-1).back,true);
});
test('media type change requires confirmation, retains text and honors image/video limits',async()=>{
  const f=fixture({media:[photo],title:'保留标题',body:'保留正文'});f.page.selectType(event('type','TEXT'));assert.equal(f.page.data.draft.media.length,1);
  f.calls.modals.at(-1).success({confirm:true});assert.equal(f.page.data.draft.media.length,0);assert.equal(f.page.data.draft.title,'保留标题');assert.equal(f.page.data.step,1);
  f.page.selectType(event('type','VIDEO'));f.wx.chooseVideo=value=>value.success({tempFilePath:'wxfile://video.mp4',size:1000,duration:61});await f.page.chooseMedia();assert.equal(f.page.data.draft.media.length,0);
  f.wx.chooseVideo=value=>value.success({tempFilePath:'wxfile://video.mp4',size:1000,duration:60});await f.page.chooseMedia();assert.equal(f.page.data.draft.media.length,1);
  f.page.selectType(event('type','IMAGE'));f.calls.modals.at(-1).success({confirm:true});f.wx.chooseMedia=value=>value.success({tempFiles:Array.from({length:12},()=>({tempFilePath:'wxfile://photo.jpg',size:1000}))});await f.page.chooseMedia();assert.equal(f.page.data.draft.media.length,9);
});
test('event cap, date guard and ended relationship visibility stay enforced',async()=>{
  const f=fixture({media:[photo],title:'记录'});for(const tag of ['约会','旅行','礼物'])f.page.toggleEvent(event('value',tag));assert.equal(f.page.data.draft.events.length,3);
  const before=f.page.data.draft.occurredAt;f.page.dateChange({detail:{value:'2999-01-01'}});assert.equal(f.page.data.draft.occurredAt,before);
  f.page.dateChange({detail:{value:'2020-02-29'}});assert.equal(f.page.data.selectedDate,'2020-02-29');assert.equal(f.page.data.displayDate,'2020年2月29日');
  f.state.couple.status='ENDED';f.page.onShow();assert.equal(f.page.data.draft.visibility,'PRIVATE');f.page.visibility(event('value','SHARED'));assert.equal(f.page.data.draft.visibility,'PRIVATE');
  await f.page.publish();assert.equal(f.calls.saved.at(-1).visibility,'PRIVATE');
});
test('keyboard reserves a separate footer area and only the content viewport shrinks',()=>{
  const f=fixture();f.page.keyboardChange({detail:{height:320}});assert.equal(f.page.data.viewportHeight-f.page.data.keyboardHeight,380);assert.equal(f.page.data.compact,true);
  f.page.onResize({size:{windowHeight:380,windowWidth:375}});assert.equal(f.page.data.viewportHeight,700);
  f.page.keyboardChange({detail:{height:0}});f.page.onResize({size:{windowHeight:568,windowWidth:320}});assert.equal(f.page.data.viewportHeight,568);assert.ok(f.page.data.mediaTileSize>=44);assert.ok(f.page.data.mediaTileSize<=88);
});
test('templates are rendered serially, stale output cannot overwrite latest options, and original mode stays available',async()=>{
  const f=fixture({media:[photo],title:'记录'});let finish;let count=0;
  f.templateService.renderTemplatePreview=()=>{count++;return new Promise(resolve=>{finish=resolve;});};
  f.page.beautify();assert.equal(count,1);f.page.selectTemplate(event('id','moon-blue'));assert.equal(count,1);
  finish('wxfile://old.jpg');await new Promise(setImmediate);assert.equal(count,2);assert.equal(f.page.data.templatePreview,'');
  finish('wxfile://new.jpg');await new Promise(setImmediate);assert.equal(f.page.data.templatePreview,'wxfile://new.jpg');assert.equal(f.page.data.draft.template,'月光蓝');
  f.page.resetTemplate();assert.equal(f.page.data.draft.template,'原始照片');assert.equal(f.page.data.templatePreview,'');f.page.closeLayout();assert.equal(f.page.data.step,1);
});
test('publish rejects double taps, interprets bindtap correctly and success cannot resurrect the removed draft',async()=>{
  const f=fixture({media:[photo],title:'记录',step:4});let finish;f.service.publish=(id,options)=>{f.calls.publish.push({id,options});return new Promise(resolve=>{finish=resolve;});};
  const request=f.page.publish({type:'tap'});await f.page.publish();assert.equal(f.calls.publish.length,1);assert.equal(f.calls.publish[0].options.skipTemplate,false);
  f.page.onHide();assert.equal(f.calls.saved.length,1);finish({id:'moment'});await request;assert.equal(f.page.data.published,true);
  f.run(700);assert.equal(f.calls.navigation.at(-1).url,'/pages-main/time/index');const saved=f.calls.saved.length;f.page.onUnload();assert.equal(f.calls.saved.length,saved);assert.equal(f.timers.size,0);
});
test('template failure retains draft and can retry original media, other failures keep appeal/session handling',async()=>{
  const f=fixture({media:[photo],title:'记录',step:4});f.service.publish=async(id,options)=>{f.calls.publish.push(options);if(!options.skipTemplate)throw Object.assign(new Error('模板失败'),{code:'TEMPLATE_RENDER_FAILED'});return{id:'moment'};};
  await f.page.publish();assert.equal(f.page.data.publishing,false);assert.equal(f.page.data.error,'模板失败');assert.ok(f.store.getDraft('draft'));
  f.calls.modals.at(-1).success({confirm:true});await new Promise(setImmediate);assert.equal(f.calls.publish.at(-1).skipTemplate,true);assert.equal(f.page.data.published,true);
  const g=fixture({media:[photo],title:'记录',step:4});g.service.publish=async()=>{throw new Error('离线');};await g.page.publish();assert.equal(g.page.data.error,'离线');assert.equal(g.calls.appeals.length,1);assert.ok(g.store.getDraft('draft'));
  g.expire();await g.page.publish();assert.equal(g.calls.appeals.length,1);
});
test('late template and publish results cannot update an unloaded page or redirect it',async()=>{
  const f=fixture({media:[photo],title:'记录',step:4});let finish;f.service.publish=()=>new Promise(resolve=>{finish=resolve;});const request=f.page.publish();f.page.onUnload();f.page.setData=()=>{throw new Error('unloaded setData');};finish({id:'moment'});await request;assert.equal(f.calls.navigation.length,0);assert.equal(f.timers.size,0);
});
