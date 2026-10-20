const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const ts = require("typescript");

function load(relative, dependencies = {}, globals = {}) {
  const filename = path.resolve(__dirname, "..", relative);
  const exports = {};
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020}}).outputText;
  vm.runInNewContext(source, {exports, setTimeout, clearTimeout, require: name => {assert.ok(name in dependencies, name); return dependencies[name]}, ...globals}, {filename});
  return exports;
}
const album = load("miniprogram/core/couple-album.ts");
function moment(id, patch = {}) {
  return {id, title:id, author:"我", occurredAt:"2026-10-14T10:00:00+08:00", visibility:"SHARED", status:"PUBLISHED", mediaType:"IMAGE",
    media:[{id:id+"-image",assetId:id+"-asset",type:"IMAGE",status:"READY",path:"https://test/"+id,thumbnailPath:"https://test/thumb-"+id}],...patch};
}
function pageFixture() {
  const state={loggedIn:true, profile:{id:"me",name:"我"}, couple:{id:"pair",status:"PAIRED",relationshipName:"关系",anniversary:"2024-05-20"}, moments:[moment("shared")],messages:[],pet:{}};
  const calls={cache:[],forgotten:[],remembered:[],navigation:[],patches:[],modals:[]};
  const service={isRemote:true,hasSession:()=>true,refresh:async()=>undefined,album:async()=>state.moments,albumPhotos:async()=>state.albumPhotos||[]};
  let page;
  load("miniprogram/pages-main/couple/index.ts", {
    "../../core/store":{store:{getState:()=>state}},"../../core/couple-album":album,
    "../../core/media-cache":{mediaCache:{get(...args){calls.cache.push(args);return calls.cachedPath},isUrlCurrent:url=>!url.includes("expired"),remember(...args){calls.remembered.push(args);return Promise.resolve(calls.savePath||args[2])},forget(...args){calls.forgotten.push(args)}}},
    "../../services/app-service":{appService:service,redirectExpiredSession:()=>false,userError:error=>error.message}
  }, {setTimeout(callback){calls.timer=callback;return 1},clearTimeout(){calls.timer=undefined},Page(value){page=value},wx:{stopPullDownRefresh(){},showModal(value){calls.modals.push(value);value.success({confirm:calls.confirmDelete!==false})},navigateTo(value){calls.navigation.push(value)},chooseMedia(options){options.success({tempFiles:[{tempFilePath:"wxfile://album.jpg",size:1024}]})},previewImage(value){calls.preview=value},showToast(value){calls.toast=value}}});
  page.data=structuredClone(page.data);
  page.setData=function(patch){calls.patches.push(patch);for(const [key,value]of Object.entries(patch)){const parts=key.replace(/\[(\d+)\]/g,".$1").split(".");let target=this.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value}};
  return {page,state,calls,service};
}
const photoEvent={currentTarget:{dataset:{column:0,index:0}}};

test("album excludes private, deleted, unpublished and unready media and retains only six newest photos",()=>{
  const shared=Array.from({length:8},(_,index)=>moment("shared-"+index,{occurredAt:`2026-10-${String(index+1).padStart(2,"0")}T10:00:00+08:00`}));
  const invalid=[moment("private",{visibility:"PRIVATE"}),moment("deleted",{status:"DELETED"}),moment("uploading",{status:"UPLOADING"}),moment("video",{mediaType:"VIDEO"}),moment("failed",{media:[{id:"fail",type:"IMAGE",status:"FAILED",path:"https://test/fail"}]}),moment("missing",{media:[{id:"missing",type:"IMAGE",status:"READY"}]})];
  const photos=album.albumPhotos([...invalid,...shared],"PAIRED");
  assert.equal(photos.length,6); assert.equal(photos[0].momentId,"shared-7"); assert.equal(photos[5].momentId,"shared-2");
  assert.equal(shared[0].id,"shared-0");
  assert.equal(album.albumPhotos(shared,"UNPAIRED").length,0);assert.equal(album.albumPhotos(shared,"ENDED").length,0);
});
test("multi-photo records preserve each image's identity and original fallback",()=>{
  const item=moment("group"); item.media.push({id:"second",type:"IMAGE",status:"READY",path:"https://test/second"});
  const photos=album.albumPhotos([item],"PAIRED");assert.equal(photos.length,2);assert.notEqual(photos[0].key,photos[1].key);assert.equal(photos[1].original,"https://test/second");
});
test("page handles partner cache authorization and thumbnail failure without losing the record entry",async()=>{
  const {page,state,calls}=pageFixture();state.moments=[moment("partner",{author:"TA"})];await page.onShow();
  assert.equal(page.data.albumCount,1); assert.equal(calls.cache.at(-1)[3],true);
  page.albumPhotoLoaded(photoEvent);assert.equal(calls.remembered[0][3],true);
  page.albumPhotoError(photoEvent);assert.equal(page.data.albumColumns[0][0].path,"https://test/partner");
  page.albumPhotoError(photoEvent);assert.equal(page.data.albumColumns[0][0].error,true);
  page.openAlbumPhoto(photoEvent);assert.equal(calls.navigation[0].url,"/pkg-moment/detail/index?id=partner");
  state.couple.status="ENDED";page.render();assert.equal(page.data.albumCount,0);
});
test("album is not reused after account/relationship changes and hidden-page requests cannot update it",async()=>{
  const {page,state,service}=pageFixture();await page.onShow();assert.equal(page.data.albumCount,1);
  state.couple.id="other-pair";page.render();assert.equal(page.data.albumCount,0);
  let complete;
  const started=new Promise(started=>{service.album=()=>new Promise(resolve=>{complete=resolve;started()})});
  const request=page.onShow();await started;page.onHide();complete([moment("late")]);await request;assert.equal(page.data.albumCount,0);
  state.couple.id="pair";state.profile.id="other-account";page.render();assert.equal(page.data.albumCount,0);
});
test("scroll motion clamps to a small range, does not remount photos and reverses on scrolling back",async()=>{
  const {page}=pageFixture();await page.onShow();const columns=page.data.albumColumns;
  page.onPageScroll({scrollTop:200});assert.equal(page.data.albumOffset,7);assert.equal(page.data.albumColumns,columns);
  page.onPageScroll({scrollTop:5000});assert.equal(page.data.albumOffset,12);
  page.onPageScroll({scrollTop:-100});assert.equal(page.data.albumOffset,0);
});
test("refresh failure preserves cached album and exposes the retry error",async()=>{
  const {page,service}=pageFixture();await page.onShow();service.refresh=async()=>{throw new Error("离线")};await page.onShow();
  assert.equal(page.data.albumCount,1);assert.equal(page.data.error,"离线");assert.equal(page.data.loading,false);
});
test("an unavailable cache file falls back safely and a logged-out account cannot open a cached album",async()=>{
  const {page,state,calls}=pageFixture();await page.onShow();
  page.data.albumColumns[0][0].path="wxfile://missing-cache";
  page.albumPhotoError(photoEvent);assert.equal(calls.forgotten.length,1);assert.equal(page.data.albumColumns[0][0].path,"https://test/thumb-shared");
  state.loggedIn=false;page.openAlbumPhoto(photoEvent);assert.equal(calls.navigation.length,0);page.render();assert.equal(page.data.albumCount,0);
});
test("unpaired and ended spaces do not request an album",async()=>{
  for(const status of ["UNPAIRED","ENDED"]) {
    const {page,state,service}=pageFixture();state.couple.status=status;service.album=async()=>{throw new Error("must not request album")};
    await page.onShow();assert.equal(page.data.error,"");assert.equal(page.data.albumCount,0);
  }
});

test("standalone album uploads are visible without a timeline moment and can be previewed",async()=>{
  const {page,state,service,calls}=pageFixture();state.moments=[];
  state.albumPhotos=[{key:"album:photo",assetId:"photo",author:"我",title:"相册照片",createdAt:new Date().toISOString(),source:"https://cos/thumb",original:"https://cos/photo"}];
  await page.onShow();
  assert.equal(page.data.albumCount,1);
  page.openAlbumPhoto(photoEvent);
  assert.equal(calls.navigation.length,0);assert.equal(calls.preview.current,"https://cos/photo");
  let uploads=0;
  service.uploadAlbumPhotos=async files=>{uploads++;assert.equal(files[0].tempFilePath,"wxfile://album.jpg");return state.albumPhotos};
  await page.uploadAlbum();assert.equal(uploads,1);assert.equal(state.moments.length,0);assert.equal(page.data.albumUploading,false);
});

test("a partially failed batch keeps polling its successful pending photos and reopening resets the budget",async()=>{
  const {page,state,service,calls}=pageFixture();await page.onShow();
  state.albumPhotos=[{key:"album:pending",assetId:"pending",author:"我",title:"相册照片",status:"PROCESSING",createdAt:new Date().toISOString(),source:"",original:""}];
  service.uploadAlbumPhotos=async()=>{throw new Error("第二张上传失败")};
  await page.uploadAlbum();
  assert.equal(page.data.albumPending,1);assert.equal(typeof calls.timer,"function");
  page.onHide();page.albumPollCount=12;await page.onShow();
  assert.equal(page.albumPollCount,0);assert.equal(typeof calls.timer,"function");page.onHide();
});

test("local demo albums can show and preview photos without remote credentials",async()=>{
  const {page,state,service,calls}=pageFixture();service.isRemote=false;service.hasSession=()=>false;state.moments=[];
  state.albumPhotos=[{key:"local",assetId:"local",author:"我",title:"照片",createdAt:new Date().toISOString(),source:"wxfile://photo",original:"wxfile://photo",status:"READY"}];
  await page.onShow();assert.equal(page.data.albumCount,1);page.openAlbumPhoto(photoEvent);assert.equal(calls.preview.current,"wxfile://photo");
});

test("a failed standalone album photo refreshes its URLs once instead of opening the broken preview",async()=>{
  const {page,state,service,calls}=pageFixture();state.moments=[];
  const old={key:"album:photo",assetId:"photo",author:"我",title:"相册照片",status:"READY",createdAt:new Date().toISOString(),source:"https://cos/expired-thumb",original:"https://cos/expired-original"};
  state.albumPhotos=[old];await page.onShow();page.albumPhotoError(photoEvent);page.albumPhotoError(photoEvent);
  let finish,requests=0;service.albumPhotos=()=>{requests++;return new Promise(resolve=>{finish=resolve})};
  const retry=page.openAlbumPhoto(photoEvent);await page.openAlbumPhoto(photoEvent);
  assert.equal(requests,1);assert.equal(calls.preview,undefined);
  finish([{...old,source:"https://cos/fresh-thumb",original:"https://cos/fresh-original"}]);await retry;
  assert.equal(page.data.albumColumns[0][0].path,"https://cos/fresh-thumb");assert.equal(page.data.albumColumns[0][0].error,false);
  assert.equal(page.data.albumRetrying,false);page.openAlbumPhoto(photoEvent);assert.equal(calls.preview.current,"https://cos/fresh-original");
});

test("saving a loaded album photo does not replace its displayed source",async()=>{
  const {page,calls}=pageFixture();await page.onShow();const source=page.data.albumColumns[0][0].path;
  calls.savePath="wxfile://saved-cover";await page.albumPhotoLoaded(photoEvent);
  assert.equal(calls.remembered.length,1);assert.equal(page.data.albumColumns[0][0].path,source);
});

test("a failed album retry retains its placeholder and can be retried again",async()=>{
  const {page,state,service,calls}=pageFixture();state.moments=[];
  state.albumPhotos=[{key:"album:photo",assetId:"photo",author:"我",status:"READY",createdAt:new Date().toISOString(),source:"https://cos/old",original:"https://cos/old"}];
  await page.onShow();page.albumPhotoError(photoEvent);
  service.albumPhotos=async()=>{throw new Error("网络不可用")};await page.openAlbumPhoto(photoEvent);
  assert.equal(page.data.albumColumns[0][0].error,true);assert.equal(page.data.albumRetrying,false);assert.equal(page.data.error,"网络不可用");assert.equal(calls.preview,undefined);
  service.albumPhotos=async()=>state.albumPhotos;await page.openAlbumPhoto(photoEvent);assert.equal(page.data.albumColumns[0][0].error,false);
});

test("a late album retry cannot restore photos after leaving, unbinding, switching accounts or losing the session",async()=>{
  for(const changed of ["hide","couple","account","session"]) {
    const {page,state,service}=pageFixture();state.moments=[];
    const old={key:"album:photo",assetId:"photo",author:"我",status:"READY",createdAt:new Date().toISOString(),source:"https://cos/old",original:"https://cos/old"};
    state.albumPhotos=[old];await page.onShow();page.albumPhotoError(photoEvent);
    let finish;service.albumPhotos=()=>new Promise(resolve=>{finish=resolve});const retry=page.openAlbumPhoto(photoEvent);
    if(changed==="hide")page.onHide();if(changed==="couple")state.couple.id="new-pair";if(changed==="account")state.profile.id="other";if(changed==="session")service.hasSession=()=>false;
    finish([{...old,source:"https://cos/new",original:"https://cos/new"}]);await retry;
    assert.equal(page.data.albumColumns[0][0].path,"https://cos/old",changed);assert.equal(page.data.albumColumns[0][0].error,true,changed);
  }
});

test("returning to the album retains visible paths and does not resend unchanged image columns",async()=>{
  const {page,calls}=pageFixture();await page.onShow();const source=page.data.albumColumns[0][0].path;
  calls.cachedPath="wxfile://saved-cover";calls.patches.length=0;page.onHide();await page.onShow();
  assert.equal(page.data.albumColumns[0][0].path,source);
  assert.equal(calls.patches.filter(patch=>"albumColumns"in patch).length,0);
});

test("album signature refresh preserves a successful original fallback but expired partner authorization replaces it",async()=>{
  const {page,state,calls}=pageFixture();state.moments=[moment("partner",{author:"TA"})];await page.onShow();
  page.albumPhotoError(photoEvent);const displayed=page.data.albumColumns[0][0].path;calls.patches.length=0;
  page.remoteAlbum=[moment("partner",{author:"TA",media:[{...state.moments[0].media[0],path:"https://test/partner?new",thumbnailPath:"https://test/thumb-partner?new"}]})];page.render();
  assert.equal(page.data.albumColumns[0][0].path,displayed);assert.equal(calls.patches.filter(patch=>"albumColumns"in patch).length,0);
  page.remoteAlbum[0].media[0].thumbnailPath="https://test/thumb-partner?expired";page.render();
  assert.notEqual(page.data.albumColumns[0][0].path,displayed);
});

test("album management reaches all own uploads and deletes only after confirmation without removing record photos",async()=>{
  const {page,state,service,calls}=pageFixture();
  state.albumPhotos=Array.from({length:8},(_,i)=>({key:`album:${i}`,assetId:`photo-${i}`,author:"我",status:"READY",title:"相册照片",createdAt:`2026-10-${String(i+1).padStart(2,"0")}T00:00:00Z`,source:`https://cos/${i}`,original:`https://cos/original-${i}`}));
  state.albumPhotos.push({...state.albumPhotos[0],key:"album:partner",assetId:"partner",author:"TA"});
  await page.onShow();page.toggleAlbumManage();assert.equal(page.data.albumColumns.flat().length,8);
  let deleted=[];service.deleteAlbumPhoto=async id=>{deleted.push(id)};
  const selected=page.data.albumColumns[0][0].assetId;calls.confirmDelete=false;await page.deleteAlbumPhoto(photoEvent);assert.equal(deleted.length,0);
  calls.confirmDelete=true;await page.deleteAlbumPhoto(photoEvent);assert.equal(deleted.join(),selected);assert.equal(page.remotePhotos.some(photo=>photo.assetId===selected),false);
  page.toggleAlbumManage();assert.equal(page.data.albumColumns.flat().some(photo=>photo.momentId==="shared"),true);
});

test("album deletion keeps a failed photo and rejects duplicate or changed-scope confirmations",async()=>{
  const {page,state,service,calls}=pageFixture();state.moments=[];state.albumPhotos=[{key:"album:me",assetId:"me-photo",author:"我",status:"READY",createdAt:new Date().toISOString(),source:"https://cos/photo",original:"https://cos/photo"}];
  await page.onShow();page.toggleAlbumManage();let finish,requests=0;service.deleteAlbumPhoto=()=>{requests++;return new Promise((resolve,reject)=>{finish=reject})};
  const pending=page.deleteAlbumPhoto(photoEvent);await new Promise(resolve=>setImmediate(resolve));await page.deleteAlbumPhoto(photoEvent);assert.equal(requests,1);
  finish(new Error("删除失败"));await pending;assert.equal(page.data.albumCount,1);assert.equal(page.data.albumDeleting,"");assert.equal(page.data.error,"删除失败");
  calls.confirmDelete=false;await page.deleteAlbumPhoto(photoEvent);assert.equal(requests,1);
  state.couple.id="changed";await page.deleteAlbumPhoto(photoEvent);assert.equal(requests,1);
});
