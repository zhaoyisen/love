/* Real same-origin admin APIs only. No credential persistence or mock fallback. */
(function () {
  'use strict';
  const M=window.AdminModel,$=id=>document.getElementById(id),e=M.escape;
  const apiRoot=new URL('../internal/admin/',location.href);
  const state={account:null,epoch:0,items:[],selected:new Set(),page:0,total:0,size:20,type:'ALL',issue:'ABNORMAL',hidden:'ALL',tab:'ABNORMAL',view:'records',busy:false,detail:null,asset:0,detailKind:null,detailId:null,taskPage:0,tasks:[],taskTotal:0};
  let authRequest=0,accountRequest=0,listRequest=0,detailRequest=0,taskRequest=0,pendingTasks=0,pollTimer,noticeTimer,confirmResolve,returnFocus;
  const date=value=>value?new Intl.DateTimeFormat('zh-CN',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value)):'—';
  const typeName=value=>({IMAGE:'照片',VIDEO:'视频',TEXT:'文字'}[value]||'媒体');
  const status=(label,tone)=>`<span class="status tone-${e(tone)}">${e(label)}</span>`;
  const taskState=value=>({PENDING:'等待／执行中',FAILED:'有失败项',COMPLETED:'已完成',SUCCEEDED:'成功',SKIPPED:'已跳过'}[value]||value);
  function showError(error) {if(error?.stale)return;$('error').hidden=false;$('error').textContent=error?.message||'操作没有完成，请重试。';}
  function clearError() {$('error').hidden=true;$('error').textContent='';}
  function notify(message) {clearTimeout(noticeTimer);$('notice').textContent=message;$('notice').hidden=false;noticeTimer=setTimeout(()=>$('notice').hidden=true,7000);}
  async function api(path,options={}) {
    const auth=authRequest;
    const response=await fetch(new URL(path,apiRoot),{credentials:'same-origin',cache:'no-store',...options,headers:{'X-Admin-Request':'1',...(options.body?{'Content-Type':'application/json'}:{}),...options.headers}});
    let body;try{body=await response.json();}catch{throw Error('服务响应异常，请检查后端地址或稍后重试。');}
    if(!response.ok) {
      const error=Object.assign(Error(body.error?.message||'请求没有完成。'),{status:response.status,code:body.error?.code});
      if(response.status===401&&!options.login&&auth===authRequest)loggedOut('登录已过期，请重新登录。');
      throw error;
    }
    return body.data;
  }
  const post=(path,body)=>api(path,{method:'POST',body:JSON.stringify(body)});
  function loggedOut(message='') {
    authRequest++;
    state.epoch++;state.account=null;state.items=[];state.selected.clear();state.detail=null;state.tasks=[];clearTimeout(pollTimer);
    listRequest++;detailRequest++;taskRequest++;accountRequest++;closeDetail();cancelConfirm();closePreview();
    $('app').hidden=true;$('identity').hidden=true;$('login-panel').hidden=false;$('token').value='';$('login-error').textContent=message;
    $('record-rows').replaceChildren();$('detail-content').replaceChildren();$('accounts').replaceChildren();$('task-list').replaceChildren();
    const url=new URL(location.href);url.searchParams.delete('account');history.replaceState(null,'',url);clearError();
  }
  function loggedIn(operator) {$('operator-name').textContent=operator;$('identity').hidden=false;$('app').hidden=false;$('login-panel').hidden=true;$('token').value='';$('login-error').textContent='';}
  function controls() {
    const n=state.selected.size,selected=state.items.filter(item=>state.selected.has(item.id));
    $('selected-count').textContent=`已选 ${n} 条`;
    $('check-records').disabled=!state.account||state.busy;
    $('rebuild-records').disabled=!n||state.busy||!selected.some(item=>item.media.length);
    $('hide-records').hidden=state.hidden==='HIDDEN';$('restore-records').hidden=state.hidden!=='HIDDEN';
    $('hide-records').disabled=!n||state.busy||selected.every(item=>item.hidden);
    $('restore-records').disabled=!n||state.busy||selected.every(item=>!item.hidden);
    const checkbox=$('select-page');checkbox.disabled=!state.items.length||state.busy;checkbox.checked=state.items.length>0&&n===state.items.length;checkbox.indeterminate=n>0&&n<state.items.length;
    $('previous-page').disabled=state.page===0||state.busy;$('next-page').disabled=(state.page+1)*state.size>=state.total||state.busy;
    $('tasks-prev').disabled=state.taskPage===0;$('tasks-next').disabled=(state.taskPage+1)*20>=state.taskTotal;
    document.querySelectorAll('[data-tab]').forEach(button=>{const active=button.dataset.tab===state.tab;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});
    document.querySelectorAll('#detail-content button[data-mutation]').forEach(button=>button.disabled=state.busy||(button.id!=='detail-visibility'&&!state.detail?.media.length));
  }
  async function searchAccounts(query='',restoreId) {
    const request=++accountRequest;clearError();$('accounts').textContent='正在查找账号…';
    try {
      const data=await api(`accounts?q=${encodeURIComponent(query)}`);if(request!==accountRequest)return;
      $('accounts').innerHTML=data.items.map(item=>`<button class="account-option" data-account-id="${e(item.id)}" aria-pressed="${state.account?.id===item.id}"><span>${e(item.nickname)}</span><small>${e(item.id)}</small></button>`).join('');
      if(!data.items.length)$('accounts').textContent='没有找到账号，请核对昵称或完整账号 ID。';
      if(data.total>data.items.length){const hint=document.createElement('p');hint.className='small subtle';hint.textContent='匹配账号较多，请输入更完整的昵称或账号 ID。';$('accounts').append(hint);}
      $('accounts').querySelectorAll('[data-account-id]').forEach(button=>button.addEventListener('click',()=>selectAccount(data.items.find(item=>item.id===button.dataset.accountId))));
      if(restoreId){const item=data.items.find(item=>item.id===restoreId);if(item)selectAccount(item);}
    }catch(error){if(request===accountRequest){$('accounts').textContent='';showError(error);}}
  }
  function selectAccount(account) {
    if(!account)return;state.epoch++;state.account=account;state.page=0;state.taskPage=0;state.items=[];state.total=0;state.tasks=[];state.selected.clear();
    listRequest++;detailRequest++;taskRequest++;pendingTasks=0;closeDetail();cancelConfirm();closePreview();clearTimeout(pollTimer);clearError();
    $('account-selection').textContent=`${account.nickname} · ${account.id} · 仅管理此账号发布的记录`;
    $('account-query').value=account.nickname;
    $('accounts').querySelectorAll('[data-account-id]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.accountId===account.id)));
    $('accounts').replaceChildren();
    const url=new URL(location.href);url.searchParams.set('account',account.id);history.replaceState(null,'',url);
    $('record-rows').replaceChildren();$('task-list').replaceChildren();controls();loadRecords();loadTasks();
  }
  function coverMedia(record) {return record.media.find(item=>item.id===record.cover_asset_id)||record.media.find(item=>item.status==='READY')||record.media[0];}
  function rowHtml(record) {
    const media=coverMedia(record),url=M.mediaUrl(media?.thumbnail_url);
    return `<tr data-record-id="${e(record.id)}" class="${state.selected.has(record.id)?'is-selected ':''}${state.detailId===record.id?'is-open':''}">
      <td class="select-col"><label class="check-label"><input type="checkbox" data-select="${e(record.id)}" aria-label="选择${e(record.title||'无标题记录')}" ${state.selected.has(record.id)?'checked':''}></label></td>
      <td><div class="record-cell"><div class="cover"><span aria-hidden="true">${record.type==='VIDEO'?'▷':'▧'}</span>${url?`<img src="${e(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">`:''}</div><div class="record-copy"><strong title="${e(record.title||record.body)}">${e(record.title||record.body||'无标题记录')}</strong><small>${typeName(record.type)} · ${e(date(record.occurred_at))}</small><div class="mobile-meta">${status(M.issueLabel(record.issue),M.tone(record.issue))}<span class="badge ${record.hidden?'':'visible'}">${record.hidden?'已隐藏':'展示中'}</span></div></div></div></td>
      <td class="health-col">${status(M.issueLabel(record.issue),M.tone(record.issue))}<div class="cell-note">${media?`原${record.type==='VIDEO'?'视频':'照片'}${e(M.stateLabel(media.source))}`:''}</div></td>
      <td class="visibility-col"><span class="badge ${record.hidden?'':'visible'}">${record.hidden?'已隐藏':'展示中'}</span></td><td class="action-col"><button class="text-button" data-view="${e(record.id)}">查看</button></td></tr>`;
  }
  function imageFallback(root) {root.querySelectorAll('img').forEach(image=>image.addEventListener('error',()=>image.remove(),{once:true}));}
  function renderRows() {
    $('record-rows').innerHTML=state.items.map(rowHtml).join('');imageFallback($('record-rows'));
    $('empty-state').hidden=state.items.length>0;$('empty-state').textContent=state.account?'当前筛选下没有记录。可切换“全部记录”，或检查该账号的媒体。':'选择账号后查看记录。';
    $('record-total').textContent=state.account?`共 ${state.total} 条记录`:'';$('page-number').textContent=String(state.page+1);
    $('record-rows').querySelectorAll('[data-select]').forEach(input=>input.addEventListener('change',()=>{input.checked?state.selected.add(input.dataset.select):state.selected.delete(input.dataset.select);input.closest('tr').classList.toggle('is-selected',input.checked);controls();}));
    $('record-rows').querySelectorAll('[data-view]').forEach(button=>button.addEventListener('click',()=>openRecord(button.dataset.view,button)));controls();
  }
  async function loadRecords() {
    if(!state.account)return;const epoch=state.epoch,request=++listRequest,account=state.account.id;clearError();
    const params=new URLSearchParams({account_id:account,page:state.page,size:state.size,type:state.type,issue:state.issue,hidden:state.hidden});
    $('record-rows').setAttribute('aria-busy','true');
    try {
      const data=await api(`records?${params}`);if(epoch!==state.epoch||request!==listRequest)return;
      if(!data.items.length&&state.page>0&&data.total<=state.page*state.size){state.page=Math.max(0,Math.ceil(data.total/state.size)-1);return loadRecords();}
      state.items=data.items;state.total=data.total;state.selected=new Set([...state.selected].filter(id=>data.items.some(item=>item.id===id)));renderRows();
    }catch(error){if(epoch===state.epoch&&request===listRequest)showError(error);}
    finally {if(request===listRequest)$('record-rows').removeAttribute('aria-busy');}
  }
  function closeDetail() {detailRequest++;state.detail=null;state.detailId=null;state.detailKind=null;$('detail').hidden=true;$('workspace').classList.remove('has-detail');$('detail-content').replaceChildren();if(returnFocus?.isConnected)returnFocus.focus({preventScroll:true});}
  function showDetail(heading,kind,id,focus) {returnFocus=focus||document.activeElement;state.detailKind=kind;state.detailId=id;$('detail-heading').textContent=heading;$('detail').hidden=false;$('workspace').classList.add('has-detail');$('detail-content').textContent='正在读取详情…';}
  async function openRecord(id,focus,keepAsset=false) {
    if(!state.account)return;const epoch=state.epoch,request=++detailRequest,account=state.account.id,previousAsset=state.asset;
    showDetail('记录详情','record',id,focus);
    try {
      const record=await api(`records/${encodeURIComponent(id)}?account_id=${account}`);if(epoch!==state.epoch||request!==detailRequest)return;
      state.detail=record;state.asset=keepAsset?Math.min(previousAsset,Math.max(0,record.media.length-1)):Math.max(0,record.media.findIndex(item=>item.id===record.cover_asset_id));renderRecordDetail();
      if(focus&&innerWidth<960)$('close-detail').focus({preventScroll:true});
    }catch(error){if(epoch===state.epoch&&request===detailRequest){$('detail-content').textContent=error.message;showError(error);}}
  }
  function renderRecordDetail() {
    const record=state.detail;if(!record)return;const media=record.media[state.asset],url=M.mediaUrl(media?.thumbnail_url);
    $('detail-content').innerHTML=`<h3 class="detail-title">${e(record.title||'无标题记录')}</h3><p class="detail-meta">${e(record.author_name)} · ${e(date(record.occurred_at))}</p>
      ${media?`<div class="asset-tabs">${record.media.map((asset,index)=>`<button data-asset="${index}" class="${index===state.asset?'active':''}" aria-pressed="${index===state.asset}">素材 ${index+1}</button>`).join('')}</div><div class="preview-surface"><div class="preview-placeholder">${e(typeName(media.kind))}<br>${e(M.issueLabel(media.issue))}</div>${url?`<img src="${e(url)}" alt="所选素材的封面" referrerpolicy="no-referrer">`:''}<button class="preview-button" id="preview-media" ${M.mediaUrl(media.preview_url)?'':'disabled'}>预览原${media.kind==='VIDEO'?'视频':'照片'}</button></div>`:''}
      ${record.body?`<p class="body-copy">${e(record.body)}</p>`:''}
      <section class="detail-section"><h3>媒体检查</h3>${media?`<dl>${[['原文件',media.source],['展示文件',media.display],['封面',media.thumbnail]].map(([name,value])=>`<div class="field-row"><dt>${name}</dt><dd>${status(M.stateLabel(value),M.tone(value))}</dd></div>`).join('')}</dl><p class="small subtle">${media.checked_at?'最近检查：'+e(date(media.checked_at)):'尚未检查实际文件。'}</p>`:'<p class="subtle">这条记录没有媒体。</p>'}
      <button id="detail-rebuild" class="primary wide" data-mutation ${record.media.length?'':'disabled'}>重新生成封面</button><button id="detail-check" class="wide" data-mutation ${record.media.length?'':'disabled'}>重新检查</button></section>
      <section class="detail-section"><h3>展示设置</h3><dl><div class="field-row"><dt>原可见范围</dt><dd>${record.visibility==='SHARED'?'双方可见':'仅自己可见'}</dd></div><div class="field-row"><dt>当前状态</dt><dd><span class="badge ${record.hidden?'':'visible'}">${record.hidden?'已隐藏':'展示中'}</span></dd></div></dl>
      <p class="small subtle">隐藏后双方都不展示；恢复后按原可见范围展示。</p><button id="detail-visibility" class="wide hidden-action" data-mutation>${record.hidden?'恢复这条记录':'隐藏这条记录'}</button><p class="small subtle">操作会保留记录与原文件。</p></section>
      <section class="detail-section"><h3>操作记录</h3>${record.operations.length?record.operations.map(op=>`<div class="operation">${op.action==='ADMIN_MOMENT_HIDE'?'隐藏':'恢复展示'} · ${e(op.operator)}<br><span class="subtle">${e(date(op.created_at))}</span></div>`).join(''):'<p class="small subtle">暂无管理操作。</p>'}</section>`;
    imageFallback($('detail-content'));
    $('detail-content').querySelectorAll('[data-asset]').forEach(button=>button.addEventListener('click',()=>{state.asset=Number(button.dataset.asset);renderRecordDetail();}));
    $('preview-media')?.addEventListener('click',previewMedia);
    $('detail-check').addEventListener('click',()=>startTask('CHECK',[record]));$('detail-rebuild').addEventListener('click',()=>startTask('REBUILD',[record]));
    $('detail-visibility').addEventListener('click',()=>changeVisibility([record],!record.hidden));controls();
  }
  function confirm(title,html,label) {
    cancelConfirm();$('confirm-title').textContent=title;$('confirm-description').innerHTML=html;$('confirm-submit').textContent=label;$('confirm-dialog').showModal();
    return new Promise(resolve=>confirmResolve=resolve);
  }
  function cancelConfirm() {if($('confirm-dialog').open)$('confirm-dialog').close();if(confirmResolve){const resolve=confirmResolve;confirmResolve=null;resolve(false);}}
  $('confirm-cancel').addEventListener('click',cancelConfirm);$('confirm-dialog').addEventListener('cancel',cancelConfirm);
  $('confirm-submit').addEventListener('click',()=>{const resolve=confirmResolve;confirmResolve=null;$('confirm-dialog').close();resolve?.(true);});
  function chosen() {return state.items.filter(item=>state.selected.has(item.id));}
  async function changeVisibility(records,hidden) {
    if(state.busy||!state.account||!records.length)return;const epoch=state.epoch,account=state.account.id;
    const approved=await confirm(hidden?'隐藏记录':'恢复展示',`<p>将${hidden?'隐藏':'恢复'} ${records.length} 条记录。</p><p>${hidden?'隐藏后自己和对方都不再展示，原文件与内容会保留。':'恢复后按每条记录原来的可见范围展示。'}</p><ul class="plan-list">${records.map(item=>`<li>${e(item.title||'无标题记录')} · ${item.visibility==='SHARED'?'双方可见':'仅自己可见'}</li>`).join('')}</ul>`,hidden?'确认隐藏':'恢复展示');
    if(!approved||epoch!==state.epoch)return;state.busy=true;controls();clearError();
    try {
      await post('records/visibility',{account_id:account,hidden,records:records.map(item=>({id:item.id,version:item.version}))});
      if(epoch!==state.epoch)return;state.selected.clear();await loadRecords();
      if(state.detailKind==='record'&&records.some(item=>item.id===state.detailId))await openRecord(state.detailId,null,true);
      notify(hidden?'记录已隐藏，双方都不再展示。':'记录已恢复，沿用原来的可见范围。');
    }catch(error){if(epoch===state.epoch){showError(error);if(error.status===409){state.selected.clear();await loadRecords();if(state.detailKind==='record')await openRecord(state.detailId,null,true);}}}
    finally {state.busy=false;controls();}
  }
  async function startTask(action,records,exactIds) {
    if(state.busy||!state.account)return;const epoch=state.epoch,account=state.account.id;
    if(action==='REBUILD'&&!records.length&&!exactIds?.length)return;
    let description;
    if(action==='REBUILD') {
      const plan=M.rebuildPlan(records);
      description=`<p>将处理 ${records.length} 条记录中的 ${plan.total} 个媒体。</p><p>已知可修复 ${plan.ready} 个；需先检查 ${plan.checkFirst} 个；已知跳过 ${plan.skipped.length} 个。</p><p class="small subtle">执行时会重新检查。只修复异常封面或展示文件，正常封面与原文件不会改动。</p>${plan.skipped.length?`<ul class="plan-list">${plan.skipped.map(item=>`<li>${e(item.reason)} · ${e(item.id)}</li>`).join('')}</ul>`:''}`;
    }else description=`<p>将检查${records.length?`所选 ${records.length} 条记录中的媒体`:'该账号全部记录中的媒体'}，读取原文件、展示文件和封面的状态。</p><p class="small subtle">检查不会删除或修改媒体文件，结果保存到任务记录。</p>`;
    if(exactIds)description='<p>将新建任务，重试失败项所在记录中的媒体。正常文件会自动跳过。</p>';
    if(!await confirm(action==='CHECK'?'检查媒体':'重建封面',description,action==='CHECK'?'开始检查':'开始重建')||epoch!==state.epoch)return;
    state.busy=true;controls();clearError();
    const id=crypto.randomUUID();
    try {
      await post('tasks',{id,account_id:account,action,moment_ids:exactIds||records.map(item=>item.id)});
      if(epoch!==state.epoch)return;notify('任务已提交，可在任务记录中查看进度。');state.taskPage=0;await loadTasks();
    }catch(error){if(epoch===state.epoch)showError(error);}
    finally {state.busy=false;controls();}
  }
  async function loadTasks() {
    clearTimeout(pollTimer);if(!state.account)return;const epoch=state.epoch,request=++taskRequest,account=state.account.id;
    try {
      const data=await api(`tasks?account_id=${account}&page=${state.taskPage}`);if(epoch!==state.epoch||request!==taskRequest)return;
      const completedTask=pendingTasks>data.pending||state.tasks.some(old=>old.status==='PENDING'&&data.items.some(item=>item.id===old.id&&item.status!=='PENDING'));
      pendingTasks=data.pending;state.tasks=data.items;state.taskTotal=data.total;renderTasks();
      if(completedTask){await loadRecords();if(state.detailKind==='record')await openRecord(state.detailId,null,true);}
      if(state.detailKind==='task'&&state.tasks.some(item=>item.id===state.detailId))await openTask(state.detailId,null,true);
      if(data.pending>0&&!document.hidden)pollTimer=setTimeout(loadTasks,2000);
    }catch(error){if(epoch===state.epoch&&request===taskRequest)showError(error);}
  }
  function renderTasks() {
    $('task-summary').textContent=pendingTasks?`${pendingTasks} 个任务等待／执行中`:'暂无正在执行的任务';
    $('task-list').innerHTML=state.tasks.length?state.tasks.map(task=>`<article class="task-card"><div><h3>${task.action==='CHECK'?'媒体检查':'封面重建'} · ${e(taskState(task.status))}</h3><p>${e(date(task.created_at))} · ${e(task.operator)}</p><progress max="100" value="${M.progress(task)}" aria-label="任务进度"></progress><p>已处理 ${task.completed} / ${task.total} · 成功 ${task.succeeded} · 跳过 ${task.skipped} · 失败 ${task.failed}</p></div><button data-task="${e(task.id)}">查看结果</button></article>`).join(''):'<div class="empty-state">该账号还没有管理任务。</div>';
    $('task-total').textContent=state.account?`共 ${state.taskTotal} 个任务`:'';$('task-list').querySelectorAll('[data-task]').forEach(button=>button.addEventListener('click',()=>openTask(button.dataset.task,button)));controls();
  }
  async function openTask(id,focus,quiet=false) {
    if(!state.account)return;const epoch=state.epoch,request=++detailRequest,account=state.account.id;
    if(!quiet)showDetail('任务详情','task',id,focus);
    try {
      const task=await api(`tasks/${encodeURIComponent(id)}?account_id=${account}`);if(epoch!==state.epoch||request!==detailRequest||state.detailKind!=='task')return;
      $('detail-content').innerHTML=`<h3 class="detail-title">${task.action==='CHECK'?'媒体检查':'封面重建'}</h3><p class="detail-meta">${e(task.operator)} · ${e(date(task.created_at))}</p><progress max="100" value="${M.progress(task)}" aria-label="任务进度"></progress><p>${task.completed} / ${task.total} 已处理 · ${e(taskState(task.status))}</p>${task.failed?'<button id="retry-task" class="wide">重试失败项</button>':''}<section class="detail-section">${task.items.map(item=>`<div class="task-item">${status(item.status==='PENDING'?'等待执行':taskState(item.status),M.tone(item.status))}<p>${e(item.message||'任务尚未执行。')}</p><p class="small subtle">素材 ${e(item.asset_id)}</p><button class="text-button" data-result-record="${e(item.moment_id)}">查看记录</button></div>`).join('')}</section>`;
      $('retry-task')?.addEventListener('click',()=>startTask(task.action,[],[...new Set(task.items.filter(item=>item.status==='FAILED').map(item=>item.moment_id))]));
      $('detail-content').querySelectorAll('[data-result-record]').forEach(button=>button.addEventListener('click',()=>openRecord(button.dataset.resultRecord,button)));
      if(focus&&innerWidth<960)$('close-detail').focus({preventScroll:true});
    }catch(error){if(epoch===state.epoch&&request===detailRequest)showError(error);}
  }
  function switchView(view) {
    state.view=view;closeDetail();$('records-section').hidden=view!=='records';$('tasks-section').hidden=view!=='tasks';
    $('page-title').textContent=view==='records'?'媒体与记录':'任务记录';$('page-description').textContent=view==='records'?'检查媒体状态，修复封面，管理记录展示。':'查看检查与重建任务的进度和结果。';
    $('nav-records').classList.toggle('active',view==='records');$('nav-tasks').classList.toggle('active',view==='tasks');
    $('nav-records').setAttribute('aria-current',view==='records'?'page':'false');$('nav-tasks').setAttribute('aria-current',view==='tasks'?'page':'false');
    $('type-filter').disabled=view!=='records';$('hidden-filter').disabled=view!=='records';if(view==='tasks')loadTasks();
  }
  function applyFilter() {state.page=0;state.selected.clear();closeDetail();controls();loadRecords();}
  async function previewMedia() {
    if(!state.detail||!state.account)return;const epoch=state.epoch,id=state.detail.id,asset=state.detail.media[state.asset]?.id;
    try {
      const record=await api(`records/${id}?account_id=${state.account.id}`);if(epoch!==state.epoch||state.detailId!==id)return;
      const media=record.media.find(item=>item.id===asset),url=M.mediaUrl(media?.preview_url);if(!url)throw Error('媒体暂不可预览，请重新检查文件状态。');
      $('preview-content').replaceChildren();$('preview-error').textContent='';const element=document.createElement(media.kind==='VIDEO'?'video':'img');
      if(media.kind==='VIDEO'){element.controls=true;element.preload='metadata';}else element.alt='原照片';
      element.referrerPolicy='no-referrer';element.src=url;element.addEventListener('error',()=>$('preview-error').textContent='媒体未能打开，请重新检查存储权限或文件状态。',{once:true});
      $('preview-content').append(element);$('preview-dialog').showModal();
    }catch(error){if(epoch===state.epoch)showError(error);}
  }
  function closePreview() {if($('preview-dialog').open)$('preview-dialog').close();$('preview-content').querySelector('video')?.pause();$('preview-content').replaceChildren();}
  $('close-preview').addEventListener('click',closePreview);$('preview-dialog').addEventListener('close',closePreview);
  $('close-detail').addEventListener('click',closeDetail);
  $('login-form').addEventListener('submit',async event=>{
    event.preventDefault();authRequest++;$('login-button').disabled=true;$('login-error').textContent='';
    try {const data=await api('session',{method:'POST',login:true,body:JSON.stringify({operator:$('operator').value.trim(),token:$('token').value})});loggedIn(data.operator);searchAccounts();}
    catch(error){$('login-error').textContent=error.message;$('token').value='';}finally{$('login-button').disabled=false;}
  });
  $('logout').addEventListener('click',async()=>{try{await api('session',{method:'DELETE'});loggedOut();}catch(error){showError(error);}});
  $('account-form').addEventListener('submit',event=>{event.preventDefault();searchAccounts($('account-query').value.trim());});
  $('type-filter').addEventListener('change',()=>{state.type=$('type-filter').value;applyFilter();});
  $('hidden-filter').addEventListener('change',()=>{state.hidden=$('hidden-filter').value;state.tab=state.hidden==='HIDDEN'?'HIDDEN':state.issue==='ABNORMAL'?'ABNORMAL':'ALL';applyFilter();});
  $('issue-filter').addEventListener('change',()=>{state.issue=$('issue-filter').value;state.tab=state.hidden==='HIDDEN'?'HIDDEN':'ALL';applyFilter();});
  document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{state.tab=button.dataset.tab;state.issue=state.tab==='ABNORMAL'?'ABNORMAL':'ALL';state.hidden=state.tab==='HIDDEN'?'HIDDEN':'ALL';$('issue-filter').value='ALL';$('hidden-filter').value=state.hidden;applyFilter();}));
  $('select-page').addEventListener('change',()=>{state.selected=new Set($('select-page').checked?state.items.map(item=>item.id):[]);renderRows();});
  $('previous-page').addEventListener('click',()=>{state.page--;state.selected.clear();closeDetail();loadRecords();});$('next-page').addEventListener('click',()=>{state.page++;state.selected.clear();closeDetail();loadRecords();});
  $('check-records').addEventListener('click',()=>startTask('CHECK',chosen()));$('rebuild-records').addEventListener('click',()=>startTask('REBUILD',chosen()));
  $('hide-records').addEventListener('click',()=>changeVisibility(chosen(),true));$('restore-records').addEventListener('click',()=>changeVisibility(chosen(),false));
  $('nav-records').addEventListener('click',()=>switchView('records'));$('nav-tasks').addEventListener('click',()=>switchView('tasks'));$('open-tasks').addEventListener('click',()=>switchView('tasks'));
  $('tasks-prev').addEventListener('click',()=>{state.taskPage--;closeDetail();loadTasks();});$('tasks-next').addEventListener('click',()=>{state.taskPage++;closeDetail();loadTasks();});
  document.addEventListener('visibilitychange',()=>{clearTimeout(pollTimer);if(!document.hidden&&state.account)loadTasks();});
  controls();
  (async()=>{const auth=authRequest,restoreId=new URL(location.href).searchParams.get('account');try{const data=await api('session',{login:true});if(auth!==authRequest)return;loggedIn(data.operator);searchAccounts(restoreId||'',restoreId);}catch(error){if(auth===authRequest)loggedOut(error.status===401?'':error.message);}})();
})();
