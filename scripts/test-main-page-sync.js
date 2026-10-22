const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),test=require('node:test'),ts=require('typescript');
function load(file,deps={},globals={}){
 if(file.startsWith('miniprogram/pages-main/'))deps={'../../core/media-cache':{mediaCache:load('miniprogram/core/media-cache.ts').mediaCache},...deps};
 const filename=path.resolve(__dirname,'..',file),exports={};
 vm.runInNewContext(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText,{exports,console,Date,setTimeout,clearTimeout,require(name){assert.ok(name in deps,name);return deps[name]},...globals},{filename});return exports;
}
function serviceFixture(globals={}){
 const state={loggedIn:true,profile:{id:'me'},couple:{id:'pair',status:'PAIRED'},moments:[],messages:[]};const calls=[];let version='v1';
 const auth={async syncVersion(){calls.push('version');return {version}},async me(){calls.push('me');return {id:state.profile.id,nickname:'我'}}};
 const store={getState:()=>state,applyRemoteProfile(value){state.profile={...state.profile,...value}},applyRemoteCouple(){},replaceRemoteMoments(items){state.moments=items},appendRemoteMoments(items){state.moments.push(...items)},applyRemoteRecap(value){state.recap=value},replaceRemoteMessages(items){state.messages=items},applyRemotePreferences(){},updateDefaultVisibility(){},applyRemotePet(){}};
 const deps={'../core/api-config':{API_CONFIG:{useRemoteApi:true}},'../core/mock-api':{},'../core/store':{store},'./request':{hasSession:()=>true},'./auth-service':{authService:auth},'./couple-service':{coupleService:{async current(){calls.push('couple');return {id:'pair',status:'PAIRED'}}}},'./moment-service':{momentService:{async timeline(){calls.push('timeline');return {items:[],has_more:false}}}},'./message-service':{messageService:{async list(){calls.push('messages');return {items:[]}}}},'./pet-service':{petService:{async current(){calls.push('pet');return {}}}},'./notification-preference-service':{notificationPreferenceService:{async current(){calls.push('preferences');return {}}}}};
 for(const name of ['compliance','media','recap','template-render'])deps['./'+name+'-service']={};
 const recapService={};deps['./recap-service']={recapService};
 deps['../core/couple-album']=load('miniprogram/core/couple-album.ts');
 const app=load('miniprogram/services/app-service.ts',deps,globals).appService;
 store.update=mutate=>mutate(state);
 return {app,state,calls,auth,recapService,coupleService:deps['./couple-service'].coupleService,setVersion(value){version=value}};
}

test('album reorder saves the server order/version and rejects duplicate or oversized selections',async()=>{
 const f=serviceFixture();f.state.couple.version=4;let requests=0;
 f.coupleService.reorderAlbumPhotos=async(id,version,ids)=>{requests++;assert.equal(id,'pair');assert.equal(version,4);return {asset_ids:ids,version:5}};
 await f.app.reorderAlbumPhotos(['second','first']);assert.equal(f.state.couple.version,5);assert.equal(f.state.couple.albumOrder.join(), 'second,first');
 await assert.rejects(f.app.reorderAlbumPhotos(['same','same']));await assert.rejects(f.app.reorderAlbumPhotos(Array.from({length:7},(_,i)=>String(i))));assert.equal(requests,1);
});
test('late album reorder responses cannot change another account or relationship',async()=>{
 for(const field of ['account','couple','logout']){
  const f=serviceFixture();let finish;f.coupleService.reorderAlbumPhotos=()=>new Promise(resolve=>{finish=resolve});
  const saving=f.app.reorderAlbumPhotos(['one','two']);if(field==='account')f.state.profile.id='other';if(field==='couple')f.state.couple.id='other';if(field==='logout')f.state.loggedIn=false;
  finish({asset_ids:['one','two'],version:2});await assert.rejects(saving);assert.equal(f.state.couple.albumOrder,undefined);
 }
});
test('album capacity includes invisible partner processing without exposing their photos',async()=>{
 const f=serviceFixture();f.coupleService.albumPhotos=async()=>[];f.coupleService.albumCapacity=async()=>({used:6});
 const photos=await f.app.albumPhotos();assert.equal(photos.length,0);assert.equal(f.state.album.used,6);
});
test('unchanged main-page entries check only version; real changes and manual refresh synchronize',async()=>{
 const f=serviceFixture();const first=await f.app.refreshIfChanged();assert.equal(f.calls.filter(v=>v==='timeline').length,1);
 f.calls.length=0;const second=await f.app.refreshIfChanged();assert.equal(second.version,first.version);assert.equal(f.calls.join(),'version');
 f.setVersion('v2');await f.app.refreshIfChanged();assert.equal(f.calls.filter(v=>v==='timeline').length,1);
 await f.app.refreshIfChanged(true);assert.equal(f.calls.filter(v=>v==='timeline').length,2);
});
test('concurrent main-page entries share one synchronization and failed checks remain retryable',async()=>{
 const f=serviceFixture();await Promise.all([f.app.refreshIfChanged(),f.app.refreshIfChanged()]);assert.equal(f.calls.filter(v=>v==='timeline').length,1);
 f.auth.syncVersion=async()=>{throw new Error('离线')};await assert.rejects(f.app.refreshIfChanged(),/离线/);
 f.auth.syncVersion=async()=>({version:'v2'});await f.app.refreshIfChanged();assert.equal(f.calls.filter(v=>v==='timeline').length,2);
});

test('manual refresh waits for an older synchronization before applying the latest version',async()=>{
 const f=serviceFixture();let finish,started,requests=0;const waiting=new Promise(resolve=>{started=resolve});
 f.auth.me=()=>{requests++;if(requests===1)return new Promise(resolve=>{finish=resolve;started()});return Promise.resolve({id:'me',nickname:'最新资料'})};
 const initial=f.app.refreshIfChanged();await waiting;f.setVersion('v2');const manual=f.app.refreshIfChanged(true);await new Promise(resolve=>setImmediate(resolve));
 assert.equal(requests,1);finish({id:'me',nickname:'旧资料'});await initial;const result=await manual;
 assert.equal(f.state.profile.name,'最新资料');assert.match(result.version,/:v2:/);
});
test('a version response from an old account cannot start synchronization for the new one',async()=>{
 const f=serviceFixture();let finish;f.auth.syncVersion=()=>new Promise(resolve=>{finish=resolve});const pending=f.app.refreshIfChanged();
 f.state.profile.id='other';finish({version:'old-account'});await assert.rejects(pending,/账号|空间|登录/);assert.equal(f.calls.includes('timeline'),false);
});

test('a profile response arriving after account or relationship switch cannot overwrite the new state',async()=>{
 for(const changed of ['account','couple']){
  const f=serviceFixture();let finish,started;
  const waiting=new Promise(resolve=>{started=resolve});f.auth.me=()=>new Promise(resolve=>{finish=resolve;started()});
  const pending=f.app.refreshIfChanged();await waiting;
  if(changed==='account')f.state.profile.id='other';else f.state.couple.id='other-pair';
  finish({id:'me',nickname:'旧响应'});await assert.rejects(pending,/账号|空间|登录/);
  assert.equal(f.state.profile.id,changed==='account'?'other':'me');assert.equal(f.calls.includes('timeline'),false);
 }
});

test('a late recap response cannot persist selected moments under another account or relationship',async()=>{
 for(const changed of ['account','couple','logout']){
  const f=serviceFixture();let finish;f.recapService.current=()=>new Promise(resolve=>{finish=resolve});const pending=f.app.recap(2026);
  if(changed==='account')f.state.profile.id='other';if(changed==='couple')f.state.couple.id='other-pair';if(changed==='logout')f.state.loggedIn=false;
  finish({year:2026,title:'旧回顾',selected_moments:[{id:'private',author_id:'me',type:'TEXT',body:'旧内容',occurred_at:'2026-10-20T00:00:00Z',visibility:'PRIVATE',status:'PUBLISHED',media:[],comments:[],events:[]}]});
  await assert.rejects(pending,/账号|空间|登录/);assert.equal(f.state.moments.length,0);assert.equal(f.state.recap,undefined);
 }
});

test('a new calendar day changes the page render key without a full data synchronization',async()=>{
 let now=new Date('2026-10-20T12:00:00+08:00').getTime();class Clock extends Date{constructor(...args){super(args.length?args[0]:now)}static now(){return now}}
 const f=serviceFixture({Date:Clock});const first=await f.app.refreshIfChanged();f.calls.length=0;now+=86400000;
 const next=await f.app.refreshIfChanged();assert.notEqual(next.version,first.version);assert.equal(f.calls.join(),'version');
});

function pageFixture(name){
 const moment={id:'moment',author:'我',title:'记录',body:'正文',occurredAt:'2026-10-20T00:00:00Z',visibility:'SHARED',status:'PUBLISHED',mediaType:'IMAGE',media:[{id:'media',assetId:'media',type:'IMAGE',status:'READY',path:'https://cos/photo',thumbnailPath:'https://cos/thumb'}],comments:[],events:[]};
 const state={loggedIn:true,profile:{id:'me',name:'我'},couple:{id:'pair',status:'PAIRED',anniversary:'2026-05-20'},moments:[moment],messages:[],album:{coupleId:'pair',photos:[]},recap:{year:2026,selectedMomentIds:['moment']},pet:{}};
 const calls={full:0,check:0,album:0,photos:0,recap:0,renders:0,forces:[],patches:[]};let version='v1';const timeline={from:'2000-01-01',to:'2026-10-21',hasMore:true,nextCursor:'first'};
 const service={isRemote:true,hasSession:()=>true,async refresh(){calls.full++;return timeline},async refreshIfChanged(force=false){calls.check++;calls.forces.push(force);return {version,timeline}},async album(){calls.album++;return state.moments},async albumPhotos(){calls.photos++;return state.album.photos},async recap(){calls.recap++}};
 let definition;load(`miniprogram/pages-main/${name}/index.ts`,{'../../core/store':{store:{getState:()=>state,appendRemoteMoments(items){state.moments=items}}},'../../core/couple-album':load('miniprogram/core/couple-album.ts'),'../../core/media-cache':{mediaCache:{...load('miniprogram/core/media-cache.ts').mediaCache,get(){},isUrlCurrent:()=>true}},'../../services/app-service':{appService:service,redirectExpiredSession:()=>false,userError:error=>error.message}},{Page(value){definition=value},wx:{stopPullDownRefresh(){}},setTimeout:()=>1,clearTimeout(){}});
 const page={...definition,data:structuredClone(definition.data),setData(patch){calls.patches.push(patch);for(const[key,value]of Object.entries(patch)){const parts=key.replace(/\[(\d+)\]/g,'.$1').split('.');let target=this.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value}}};
 const render=page.render;page.render=function(){calls.renders++;return render.call(this)};
 return {page,state,service,calls,setVersion(value){version=value}};
}
for(const name of ['time','couple','mine','recap'])test(`${name} preserves its rendered state on return and updates on actual changes or pull down`,async()=>{
 const f=pageFixture(name);await f.page.onShow();const renders=f.calls.renders,albums=f.calls.album,photos=f.calls.photos,recaps=f.calls.recap;
 f.page.data.nextCursor='older-page';if(f.page.onHide)f.page.onHide();await f.page.onShow();
 assert.equal(f.calls.full,0,'page must use the conditional sync gate');assert.equal(f.calls.renders,renders,'unchanged return must not render');assert.equal(f.page.data.nextCursor,'older-page');
 assert.equal(f.calls.album,albums);assert.equal(f.calls.photos,photos);assert.equal(f.calls.recap,recaps);
 f.setVersion('v2');await f.page.onShow();assert.ok(f.calls.renders>renders);
 await f.page.onPullDownRefresh();assert.equal(f.calls.forces.at(-1),true);
});

test('unchanged avatar signatures keep a valid display URL; replacement, expiry and load failures adopt the latest URL',()=>{
 const cache=load('miniprogram/core/media-cache.ts').mediaCache;
 const old='https://cos/avatar.webp?q-key-time=1;'+(Math.floor(Date.now()/1000)+3600)+'&q-signature=old';
 const fresh=old.replace('=old','=new');assert.equal(cache.stableUrl(old,fresh),old);
 assert.equal(cache.stableUrl(old,fresh,true),fresh);
 assert.equal(cache.stableUrl(old,'https://cos/new-avatar.webp'), 'https://cos/new-avatar.webp');
 assert.equal(cache.stableUrl('https://cos/avatar.webp?q-key-time=1;1',fresh),fresh);
 assert.equal(cache.stableUrl(old,''),'');
});

test('a changed loaded timeline revalidates every loaded page and keeps filtering and pagination',async()=>{
 const f=pageFixture('time');await f.page.onShow();const template=f.state.moments[0];
 f.page.remoteMoments=Array.from({length:100},(_,i)=>({...template,id:'old-'+i}));f.page.data.moments=f.page.remoteMoments;f.page.data.nextCursor='old-third';
 const first=Array.from({length:50},(_,i)=>({...template,id:'fresh-'+i})), second=Array.from({length:49},(_,i)=>({...template,id:'old-'+(50+i)}));let calls=[];
 f.service.timelinePage=async(from,to,limit,cursor)=>{calls.push(cursor);return cursor?{items:second,next_cursor:'third',has_more:true}:{items:first,next_cursor:'second',has_more:true}};
 f.setVersion('v2');await f.page.onShow();assert.equal(calls.length,2);assert.equal(f.page.remoteMoments.some(item=>item.id==='old-99'),false);assert.equal(f.page.data.nextCursor,'third');
 f.page.data.viewType='week';await f.page.onPullDownRefresh();assert.equal(f.page.data.loading,false);assert.equal(f.page.data.viewType,'week');
});

test('a hidden range response cannot mark a new data version as consumed',async()=>{
 const f=pageFixture('time');await f.page.onShow();f.page.data.viewType='week';f.setVersion('v2');let finish;
 f.service.timelinePage=()=>new Promise(resolve=>{finish=resolve});const pending=f.page.onShow();await new Promise(resolve=>setImmediate(resolve));f.page.onHide();finish({items:[],has_more:false});await pending;
 assert.equal(f.page.syncVersion,'v1');
});

for(const name of ['time','couple','mine'])test(`${name} does not resend unchanged avatar sources when unrelated data or signatures change`,async()=>{
 const f=pageFixture(name);const old='https://cos/avatar.webp?q-key-time=1;9999999999&q-signature=old';
 f.state.profile.avatarUrl=old;f.state.couple.partnerAvatarUrl=old;await f.page.onShow();f.calls.patches.length=0;
 f.state.profile.avatarUrl=old.replace('=old','=fresh');f.state.couple.partnerAvatarUrl=f.state.profile.avatarUrl;f.setVersion('v2');await f.page.onShow();
 assert.equal(f.page.data.myAvatarUrl,old);assert.equal(f.calls.patches.some(patch=>'myAvatarUrl'in patch||'partnerAvatarUrl'in patch),false);
});

for(const name of ['time','mine','recap'])test(`${name} clears the previous account view before waiting for a new scope`,async()=>{
 const f=pageFixture(name);f.state.profile.avatarUrl='https://cos/old-avatar';await f.page.onShow();
 f.state.profile={id:'other',name:'新用户',avatarUrl:''};f.state.couple={status:'UNPAIRED'};f.state.moments=[];
 let finish;f.service.refreshIfChanged=()=>new Promise(resolve=>{finish=resolve});const pending=f.page.onShow();
 assert.equal(f.page.data.loaded,false);if(name==='time')assert.equal(f.page.data.moments.length,0);if(name==='mine')assert.equal(f.page.data.myAvatarUrl,'');if(name==='recap')assert.equal(f.page.data.coverPath,'');
 finish({version:'new-account',timeline:{from:'2000-01-01',to:'2026-10-21',hasMore:false,nextCursor:''}});await pending;
});

for(const name of ['time','couple','mine','recap'])test(`${name} clears a recovered version-check error without reloading unchanged content`,async()=>{
 const f=pageFixture(name);await f.page.onShow();const check=f.service.refreshIfChanged;
 f.service.refreshIfChanged=async()=>{throw new Error('离线')};await f.page.onShow();assert.equal(f.page.data.error,'离线');const renders=f.calls.renders;
 f.service.refreshIfChanged=check;await f.page.onShow();assert.equal(f.page.data.error,'');assert.equal(f.calls.renders,renders);
});
