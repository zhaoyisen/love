const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const test=require('node:test'),ts=require('typescript');
function fixture(isRemote=true){
 const state={profile:{name:'小满',defaultVisibility:'PRIVATE',avatarUrl:''},couple:{status:'PAIRED',relationshipName:'满屿之间',partnerName:'阿屿',partnerAvatarUrl:''},preferences:{momentNotice:true,reactionNotice:true,petNotice:true,recapNotice:true},messages:[]};
 const calls={preferences:[],navigation:[],toasts:[],modals:[],tabs:[],reset:0};let page,expired=false;
 const store={getState:()=>state,updatePreference(key,value){state.preferences[key]=value;},reset(){calls.reset++;}};
 const service={isRemote,async refresh(){},async updateNotificationPreference(key,value){calls.preferences.push({key,value});}};
 const wx={navigateTo(value){calls.navigation.push(value);},switchTab(value){calls.navigation.push(value);},reLaunch(value){calls.navigation.push(value);},showToast(value){calls.toasts.push(value);},showModal(value){calls.modals.push(value);}};
 const filename=path.resolve(__dirname,'../miniprogram/pages-main/mine/index.ts');
 const source=ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
 const deps={'../../core/api-config':{API_CONFIG:{clientVersion:'test-version'}},'../../core/store':{store},'../../services/app-service':{appService:service,redirectExpiredSession:()=>expired,userError:(error,fallback)=>error.message||fallback}};
 vm.runInNewContext(source,{exports:{},require(name){assert.ok(name in deps,name);return deps[name];},Page(value){page=value;},wx},{filename});
 page.data=structuredClone(page.data);page.setData=function(patch){Object.assign(this.data,patch);};page.getTabBar=()=>({setData:value=>calls.tabs.push(value)});
 return {page,state,calls,service,expire(){expired=true;}};
}
const change=(key,value)=>({currentTarget:{dataset:{key}},detail:{value}});

test('notification disclosure starts closed, preserves preferences and counts only the four existing controls',async()=>{
 const f=fixture();f.state.preferences.extraFuturePreference=true;await f.page.onShow();
 assert.equal(f.page.data.noticesOpen,false);assert.equal(f.page.data.noticeCount,4);assert.equal(f.calls.tabs[0].selected,3);
 const before=JSON.stringify(f.state.preferences);f.page.toggleNotices();assert.equal(f.page.data.noticesOpen,true);f.page.toggleNotices();assert.equal(f.page.data.noticesOpen,false);
 assert.equal(JSON.stringify(f.state.preferences),before);assert.equal(f.calls.preferences.length,0);
});
test('saving updates the visible count and a failure restores the original switch and summary',async()=>{
 const f=fixture();await f.page.onShow();await f.page.toggle(change('momentNotice',false));assert.equal(f.page.data.noticeCount,3);
 f.service.updateNotificationPreference=async()=>{throw new Error('离线');};await f.page.toggle(change('petNotice',false));
 assert.equal(f.state.preferences.petNotice,true);assert.equal(f.page.data.noticeCount,3);assert.equal(f.page.data.savingPreference,false);assert.equal(f.calls.toasts.at(-1).title,'离线');
 f.expire();await f.page.toggle(change('petNotice',false));assert.equal(f.calls.toasts.length,1);
});
test('whole-preference saves cannot overlap and loading keeps switches disabled',async()=>{
 const f=fixture();await f.page.onShow();let finish;
 f.service.updateNotificationPreference=(key,value)=>{f.calls.preferences.push({key,value});return new Promise(resolve=>{finish=resolve;});};
 const saving=f.page.toggle(change('momentNotice',false));assert.equal(f.page.data.savingPreference,true);await f.page.toggle(change('petNotice',false));
 assert.equal(f.calls.preferences.length,1);assert.equal(f.state.preferences.petNotice,true);finish();await saving;assert.equal(f.page.data.savingPreference,false);
 f.page.setData({loading:true});await f.page.toggle(change('reactionNotice',false));assert.equal(f.calls.preferences.length,1);
});
test('refresh failures preserve cached identity, visibility and preferences with retry available',async()=>{
 const f=fixture();f.state.preferences.petNotice=false;f.service.refresh=async()=>{throw new Error('同步失败');};await f.page.onShow();
 assert.equal(f.page.data.loaded,true);assert.equal(f.page.data.loading,false);assert.equal(f.page.data.state.profile.name,'小满');assert.equal(f.page.data.state.profile.defaultVisibility,'PRIVATE');assert.equal(f.page.data.noticeCount,3);assert.equal(f.page.data.error,'同步失败');
 f.service.refresh=async()=>{};await f.page.retry();assert.equal(f.page.data.error,'');
});
test('paired, unpaired and ended relationship copy and unread summaries remain intact',()=>{
 const f=fixture();f.state.messages=[{read:false},{read:true}];f.page.render();assert.equal(f.page.data.unreadCount,1);assert.equal(f.page.data.relationshipStatusText,'已配对');
 f.state.couple.status='UNPAIRED';f.page.render();assert.equal(f.page.data.relationshipStatusText,'尚未配对');assert.equal(f.page.data.relationshipDescription,'先独自记录，配对后再决定哪些内容共同可见');
 f.state.couple.status='ENDED';f.page.render();assert.equal(f.page.data.relationshipStatusText,'已结束');assert.equal(f.page.data.relationshipDescription,'双方内容已停止互访，你创建的记录仍会保留');
});
test('avatar failures fall back to initials until their source changes',()=>{
 const f=fixture();f.state.profile.avatarUrl='https://avatar/me';f.state.couple.partnerAvatarUrl='https://avatar/partner';f.page.render();
 f.page.avatarError({currentTarget:{dataset:{avatar:'my'}}});f.page.avatarError({currentTarget:{dataset:{avatar:'partner'}}});f.page.render();assert.equal(f.page.data.myAvatarError,true);assert.equal(f.page.data.partnerAvatarError,true);
 f.state.profile.avatarUrl='https://avatar/new-me';f.state.couple.partnerAvatarUrl='https://avatar/new-partner';f.page.render();assert.equal(f.page.data.myAvatarError,false);assert.equal(f.page.data.partnerAvatarError,false);
});
test('all existing routes and account confirmation behavior are retained',()=>{
 const f=fixture();for(const name of ['edit','privacy','recycle','messages','deleteAccount'])f.page[name]();
 assert.equal(f.calls.navigation.map(value=>value.url).join('|'),'/pkg-profile/edit/index|/pkg-couple/privacy/index|/pkg-moment/recycle-bin/index|/pkg-couple/messages/index|/pkg-profile/delete-account/index');
 f.page.about();assert.ok(f.calls.modals.at(-1).content.includes('test-version'));f.page.recap();f.page.reset();assert.equal(f.calls.navigation.length,5);assert.equal(f.calls.reset,0);
 const demo=fixture(false);demo.page.recap();assert.equal(demo.calls.navigation[0].url,'/pages-main/recap/index');demo.page.reset();assert.equal(demo.calls.reset,0);demo.calls.modals.at(-1).success({confirm:false});assert.equal(demo.calls.reset,0);demo.calls.modals.at(-1).success({confirm:true});assert.equal(demo.calls.reset,1);assert.equal(demo.calls.navigation.at(-1).url,'/pages/welcome/index');
});
test('the redesigned page keeps original explanatory copy and all four native reminder controls',()=>{
 const mini=path.resolve(__dirname,'../miniprogram');const wxml=fs.readFileSync(mini+'/pages-main/mine/index.wxml','utf8');const source=wxml+fs.readFileSync(mini+'/pages-main/mine/index.ts','utf8');
 for(const copy of ['身份、关系与设置','这里保管你的资料、分享边界和提醒。','先确认是谁，再管理共同空间','管理分享边界和已删除内容','分享由你决定','每条记录都能确认可见范围，旧内容不会因为配对自动共享。','删除后保留 30 天','只控制小程序内出现的信笺','这些偏好会同步到你的账号。微信服务通知需要在模板配置完成后另行授权。','演示模式下，这些开关只保存在当前设备。','以下操作只会在你明确确认后执行','冻结情侣空间、撤销本机登录，并生成处理进度','清除当前设备上的所有演示状态'])assert.ok(source.includes(copy),copy);
 assert.equal((wxml.match(/<switch /g)||[]).length,4);assert.ok(wxml.includes('disabled="{{loading || savingPreference}}"'));
 const nav=fs.readFileSync(mini+'/custom-tab-bar/index.wxml','utf8');assert.ok(nav.includes('selected === 3 ? \'/assets/icons/home/user-round-active.png\''));
});
