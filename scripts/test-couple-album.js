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
  const calls={cache:[],forgotten:[],remembered:[],navigation:[]};
  const service={isRemote:true,hasSession:()=>true,refresh:async()=>undefined,album:async()=>state.moments,albumPhotos:async()=>state.albumPhotos||[]};
  let page;
  load("miniprogram/pages-main/couple/index.ts", {
    "../../core/store":{store:{getState:()=>state}},"../../core/couple-album":album,
    "../../core/media-cache":{mediaCache:{get(...args){calls.cache.push(args)},remember(...args){calls.remembered.push(args)},forget(...args){calls.forgotten.push(args)}}},
    "../../services/app-service":{appService:service,redirectExpiredSession:()=>false,userError:error=>error.message}
  }, {setTimeout(callback){calls.timer=callback;return 1},clearTimeout(){calls.timer=undefined},Page(value){page=value},wx:{stopPullDownRefresh(){},navigateTo(value){calls.navigation.push(value)},chooseMedia(options){options.success({tempFiles:[{tempFilePath:"wxfile://album.jpg",size:1024}]})},previewImage(value){calls.preview=value},showToast(value){calls.toast=value}}});
  page.data=structuredClone(page.data);
  page.setData=function(patch){for(const [key,value]of Object.entries(patch)){const parts=key.replace(/\[(\d+)\]/g,".$1").split(".");let target=this.data;for(const part of parts.slice(0,-1))target=target[part];target[parts.at(-1)]=value}};
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
