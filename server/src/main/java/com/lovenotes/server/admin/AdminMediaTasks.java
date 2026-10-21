package com.lovenotes.server.admin;

import com.lovenotes.server.common.*;
import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.storage.ObjectStorage;
import jakarta.persistence.*;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.Instant;
import java.util.*;

@Service
public class AdminMediaTasks {
    private final EntityManager db;
    private final AdminRecords records;
    private final ObjectStorage storage;
    private final AuditService audit;
    public AdminMediaTasks(EntityManager db,AdminRecords records,ObjectStorage storage,AuditService audit) {this.db=db;this.records=records;this.storage=storage;this.audit=audit;}

    @Transactional
    public TaskView create(UUID id,UUID account,String action,List<UUID> momentIds,String operator,String requestId) {
        records.requireAccount(account);
        if(!Set.of("CHECK","REBUILD").contains(action)||momentIds.size()>500||momentIds.stream().distinct().count()!=momentIds.size()||action.equals("REBUILD")&&momentIds.isEmpty())throw AdminRecords.invalid("任务类型不正确，或请选择 1 至 500 条不同的记录。");
        String hash=Hashing.sha256(account+"|"+action+"|"+momentIds.stream().map(UUID::toString).sorted().toList());
        var existing=db.find(AdminMediaTask.class,id);
        if(existing!=null) {
            if(!existing.selectionHash.equals(hash))throw new ApiException(HttpStatus.CONFLICT,"ADMIN_TASK_CONFLICT","任务请求已使用，请刷新后重新提交。");
            return view(existing,false);
        }
        for(UUID moment:momentIds)records.requireRecord(account,moment);
        String predicate="a.momentId=m.id and m.authorId=:account and m.status not in (com.lovenotes.server.domain.DomainEnums$MomentStatus.TRASHED,com.lovenotes.server.domain.DomainEnums$MomentStatus.PURGED,com.lovenotes.server.domain.DomainEnums$MomentStatus.DRAFT)";
        if(!momentIds.isEmpty())predicate+=" and m.id in :ids";
        var query=db.createQuery("select a from MediaAssetEntity a,MomentEntity m where "+predicate+" order by a.createdAt,a.id",MediaAssetEntity.class).setParameter("account",account);
        if(!momentIds.isEmpty())query.setParameter("ids",momentIds);
        // shortcut: one task holds at most 5000 media items; use selected-record batches for larger libraries.
        var media=query.setMaxResults(5001).getResultList();
        if(media.size()>5000)throw AdminRecords.invalid("媒体超过 5000 个，请选择记录分批检查。");
        if(media.isEmpty())throw AdminRecords.invalid("这些记录中没有可检查的媒体。");
        var task=new AdminMediaTask(id,account,action,operator,hash);db.persist(task);
        for(var asset:media) {
            var item=new AdminMediaTaskItem(id,asset.getId(),asset.getMomentId());
            if(action.equals("REBUILD")) {
                db.refresh(asset,LockModeType.PESSIMISTIC_WRITE);
                var planned=ObjectStorage.derivativeKeys(asset.getKind(),asset.getStorageKey(),item.id.toString());
                // Persist planned paths before any provider call, including partial writes after a crash.
                asset.rememberObjects(List.of(planned.displayKey(),planned.thumbnailKey()));
            }
            db.persist(item);
        }
        audit.record(null,null,"ADMIN_TASK",id,"ADMIN_MEDIA_"+action,"QUEUED",operator,requestId,Map.of("account_id",account,"operator",operator,"asset_count",media.size()));
        db.flush();return view(task,false);
    }

    @Transactional(readOnly=true)
    public TaskPage list(UUID account,int page) {
        records.requireAccount(account);if(page<0||page>100000)throw AdminRecords.invalid("分页参数不正确。");
        var tasks=db.createQuery("select x from AdminMediaTask x where x.accountId=:account order by x.createdAt desc,x.id desc",AdminMediaTask.class).setParameter("account",account).setFirstResult(page*20).setMaxResults(20).getResultList();
        long total=db.createQuery("select count(x) from AdminMediaTask x where x.accountId=:account",Long.class).setParameter("account",account).getSingleResult();
        long pending=db.createQuery("select count(distinct x.taskId) from AdminMediaTaskItem x where x.status='PENDING' and x.taskId in (select t.id from AdminMediaTask t where t.accountId=:account)",Long.class).setParameter("account",account).getSingleResult();
        return new TaskPage(tasks.stream().map(t->view(t,false)).toList(),total,page,20,pending);
    }
    @Transactional(readOnly=true)
    public TaskView detail(UUID account,UUID id) {
        var task=db.find(AdminMediaTask.class,id);if(task==null||!task.accountId.equals(account))throw AdminRecords.missing();return view(task,true);
    }
    @Transactional(readOnly=true)
    public List<UUID> pending() {return db.createQuery("select x.id from AdminMediaTaskItem x where x.status='PENDING' order by x.updatedAt,x.id",UUID.class).setMaxResults(5).getResultList();}

    @Transactional
    public void processItem(UUID id) {
        // Item + asset locks make retries/restarts safe and serialize with album deletion/backfill.
        var item=db.find(AdminMediaTaskItem.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(item==null||!item.status.equals("PENDING"))return;
        var task=db.find(AdminMediaTask.class,item.taskId);
        var asset=db.find(MediaAssetEntity.class,item.assetId,LockModeType.PESSIMISTIC_WRITE);
        var moment=db.find(MomentEntity.class,item.momentId);
        var user=task==null?null:db.find(UserEntity.class,task.accountId);
        if(task==null||asset==null||moment==null||user==null||user.getStatus()!=DomainEnums.UserStatus.ACTIVE||!task.accountId.equals(moment.getAuthorId())||!item.momentId.equals(asset.getMomentId())||Set.of(DomainEnums.MomentStatus.TRASHED,DomainEnums.MomentStatus.PURGED).contains(moment.getStatus())) {
            item.finish("SKIPPED","记录已移除、账号状态变化或媒体已不存在。");return;
        }
        AdminMediaCheck check=inspect(asset);db.merge(check);
        String status="SUCCEEDED",message="检查完成。";
        if(task.action.equals("REBUILD")) {
            if(asset.getStatus()!=DomainEnums.MediaStatus.READY){status="SKIPPED";message="媒体未通过安全处理或已删除，不能重建封面。";}
            else if(check.sourceState.equals("MISSING")){status="SKIPPED";message="原文件缺失，无法重建封面。";}
            else if(List.of(check.sourceState,check.displayState,check.thumbnailState).contains("ERROR")){status="FAILED";message="存储权限、网络或文件状态异常，请重新检查。";}
            else if(check.thumbnailState.equals("AVAILABLE")&&check.displayState.equals("AVAILABLE")){status="SKIPPED";message="封面和展示文件正常，无需重建。";}
            else {
                String stage="GENERATE",thumbnailState="UNCHECKED",displayState="UNCHECKED";
                try {
                    asset.rememberObjects(asset.objectKeys());
                    var generated=storage.regenerateDerivatives(asset.getKind(),asset.getStorageKey(),item.id.toString());
                    if(generated!=null)asset.rememberObjects(java.util.stream.Stream.of(generated.displayKey(),generated.thumbnailKey()).filter(Objects::nonNull).toList());
                    stage="VERIFY";
                    thumbnailState=probe(generated==null?null:generated.thumbnailKey(),-1);
                    displayState=probe(generated==null?null:generated.displayKey(),-1);
                    if(!thumbnailState.equals("AVAILABLE")||!displayState.equals("AVAILABLE"))throw new IllegalStateException("derivatives unavailable");
                    asset.updateDerivatives(check.displayState.equals("AVAILABLE")&&asset.getDisplayStorageKey()!=null?asset.getDisplayStorageKey():generated.displayKey(),check.thumbnailState.equals("AVAILABLE")&&asset.getThumbnailStorageKey()!=null?asset.getThumbnailStorageKey():generated.thumbnailKey());
                    db.merge(new AdminMediaCheck(asset,"AVAILABLE","AVAILABLE","AVAILABLE"));
                    message="封面已重建。";
                } catch(Exception exception) {
                    org.slf4j.LoggerFactory.getLogger(getClass()).warn("Admin media rebuild failed: task={}, item={}, asset={}, kind={}, stage={}, thumbnailState={}, displayState={}, exceptionType={}",
                            task.id,item.id,asset.getId(),asset.getKind(),stage,thumbnailState,displayState,exception.getClass().getSimpleName());
                    status="FAILED";message=stage.equals("GENERATE")?"封面生成失败，请查看服务日志后重试。":"封面生成后的文件验证失败，请查看服务日志后重试。";
                }
            }
        } else if(List.of(check.sourceState,check.displayState,check.thumbnailState).contains("ERROR")) {status="FAILED";message="检查失败，请检查存储权限或网络后重试。";}
        item.finish(status,message);
        audit.record(null,moment.getCoupleId(),"MEDIA_ASSET",asset.getId(),"ADMIN_MEDIA_"+task.action,status,task.operatorName,null,Map.of("task_id",task.id,"operator",task.operatorName,"message",message));
    }
    @Transactional
    public void fail(UUID id) {
        var item=db.find(AdminMediaTaskItem.class,id,LockModeType.PESSIMISTIC_WRITE);
        if(item!=null&&item.status.equals("PENDING"))item.finish("FAILED","任务执行失败，请稍后重试。");
    }
    private AdminMediaCheck inspect(MediaAssetEntity asset) {
        String source=probe(asset.getStorageKey(),asset.getSizeBytes());
        String display=asset.getDisplayStorageKey()==null||asset.getDisplayStorageKey().equals(asset.getStorageKey())?source:probe(asset.getDisplayStorageKey(),-1);
        return new AdminMediaCheck(asset,source,display,probe(asset.getThumbnailStorageKey(),-1));
    }
    private String probe(String key,long expectedSize) {
        if(key==null||key.isBlank())return "UNSET";
        try {var info=storage.stat(key,expectedSize);return info!=null&&info.size()>0&&(expectedSize<0||info.size()==expectedSize)?"AVAILABLE":"ERROR";}
        catch(ApiException error) {return error.code().equals("UPLOAD_NOT_FOUND")?"MISSING":"ERROR";}
        catch(Exception error) {return "ERROR";}
    }
    private TaskView view(AdminMediaTask task,boolean detailed) {
        var counts=db.createQuery("select x.status,count(x) from AdminMediaTaskItem x where x.taskId=:id group by x.status",Object[].class).setParameter("id",task.id).getResultList();
        Map<String,Long> n=new HashMap<>();counts.forEach(row->n.put((String)row[0],(Long)row[1]));
        long pending=n.getOrDefault("PENDING",0L),failed=n.getOrDefault("FAILED",0L),total=n.values().stream().mapToLong(Long::longValue).sum();
        var items=detailed?db.createQuery("select x from AdminMediaTaskItem x where x.taskId=:id order by x.id",AdminMediaTaskItem.class).setParameter("id",task.id).getResultList().stream().map(x->new ItemView(x.id,x.assetId,x.momentId,x.status,x.message)).toList():List.<ItemView>of();
        return new TaskView(task.id,task.accountId,task.action,task.operatorName,task.createdAt,pending>0?"PENDING":failed>0?"FAILED":"COMPLETED",total,total-pending,n.getOrDefault("SUCCEEDED",0L),failed,n.getOrDefault("SKIPPED",0L),items);
    }
    public record ItemView(UUID id,UUID assetId,UUID momentId,String status,String message) {}
    public record TaskPage(List<TaskView> items,long total,int page,int size,long pending) {}
    public record TaskView(UUID id,UUID accountId,String action,String operator,Instant createdAt,String status,long total,long completed,long succeeded,long failed,long skipped,List<ItemView> items) {}
}
