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

test('mine opens personal profile and a dedicated settings page',async()=>{
 const f=fixture();await f.page.onShow();f.page.edit();f.page.settings();
 assert.equal(f.calls.navigation.map(value=>value.url).join('|'),'/pkg-profile/edit/index|/pkg-profile/settings/index');
 assert.equal(f.calls.tabs[0].selected,3);assert.equal(f.calls.preferences.length,0);
});
test('cached profile, relationship and unread count survive refresh failures',async()=>{
 const f=fixture();f.state.messages=[{read:false},{read:true}];f.service.refresh=async()=>{throw new Error('同步失败');};await f.page.onShow();
 assert.equal(f.page.data.loaded,true);assert.equal(f.page.data.state.profile.name,'小满');assert.equal(f.page.data.unreadCount,1);assert.equal(f.page.data.error,'同步失败');
 f.service.refresh=async()=>{};await f.page.retry();assert.equal(f.page.data.error,'');
});
test('paired, unpaired and ended relationship copy stays consistent',()=>{
 const f=fixture();f.page.render();assert.equal(f.page.data.relationshipStatusText,'已配对');
 f.state.couple.status='UNPAIRED';f.page.render();assert.equal(f.page.data.relationshipStatusText,'尚未配对');
 f.state.couple.status='ENDED';f.page.render();assert.equal(f.page.data.relationshipStatusText,'已结束');assert.equal(f.page.data.relationshipDescription,'双方内容已停止互访，你创建的记录仍会保留');
});
test('avatar failures fall back to initials and a new image URL restores display',()=>{
 const f=fixture();f.state.profile.avatarUrl='https://avatar/me';f.state.couple.partnerAvatarUrl='https://avatar/partner';f.page.render();
 f.page.avatarError({currentTarget:{dataset:{avatar:'my'}}});f.page.avatarError({currentTarget:{dataset:{avatar:'partner'}}});f.page.render();assert.equal(f.page.data.myAvatarError,true);assert.equal(f.page.data.partnerAvatarError,true);
 f.state.profile.avatarUrl='https://avatar/new';f.page.render();assert.equal(f.page.data.myAvatarError,false);assert.equal(f.page.data.partnerAvatarError,true);
});
