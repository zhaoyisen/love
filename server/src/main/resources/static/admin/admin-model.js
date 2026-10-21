(function (root) {
  'use strict';
  const issues={NORMAL:'正常',UNCHECKED:'未检查',SOURCE_MISSING:'原文件缺失',COVER_MISSING:'封面缺失',DISPLAY_MISSING:'展示图缺失',CHECK_FAILED:'检查失败',UNAVAILABLE:'处理失败／已删除',NO_MEDIA:'没有媒体数据'};
  const states={AVAILABLE:'可用',MISSING:'缺失',UNSET:'未生成',ERROR:'检查失败',UNCHECKED:'未检查'};
  const model={
    escape(value) { return String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char])); },
    mediaUrl(value) { try {if(!/^https:\/\//i.test(value))return '';const url=new URL(value);return !url.username&&!url.password?url.href:'';}catch{return '';} },
    issueLabel(value) {return Object.hasOwn(issues,value)?issues[value]:'状态未知';},
    stateLabel(value) {return Object.hasOwn(states,value)?states[value]:'未检查';},
    tone(value) {return ['NORMAL','AVAILABLE','SUCCEEDED','COMPLETED'].includes(value)?'good':['SOURCE_MISSING','UNAVAILABLE','FAILED'].includes(value)?'error':['COVER_MISSING','DISPLAY_MISSING','MISSING','UNSET','CHECK_FAILED','ERROR'].includes(value)?'warning':'muted';},
    progress(task) {return task.total>0?Math.min(100,Math.max(0,Math.round(task.completed/task.total*100))):0;},
    rebuildPlan(records) {
      const plan={total:0,ready:0,checkFirst:0,skipped:[]};
      for(const record of records)for(const media of record.media||[]) {
        plan.total++;
        const reason=media.status!=='READY'?'未通过安全处理或已删除':media.source==='MISSING'?'原文件缺失':media.thumbnail==='AVAILABLE'&&media.display==='AVAILABLE'?'封面与展示图正常':'';
        if(reason)plan.skipped.push({id:media.id,reason});
        else if(media.source==='AVAILABLE'&&!['ERROR','UNCHECKED'].includes(media.thumbnail)&&!['ERROR','UNCHECKED'].includes(media.display))plan.ready++;
        else plan.checkFirst++;
      }
      return plan;
    }
  };
  if(typeof module==='object'&&module.exports)module.exports=model;else root.AdminModel=model;
})(typeof globalThis==='object'?globalThis:this);
