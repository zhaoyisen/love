package com.lovenotes.server.admin;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.domain.*;
import com.lovenotes.server.repository.*;
import com.lovenotes.server.storage.ObjectStorage;
import jakarta.persistence.EntityManager;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.time.*;
import java.util.*;

@Service
public class AdminRecords {
    private final EntityManager db;
    private final MomentRepository moments;
    private final MediaAssetRepository assets;
    private final UserRepository users;
    private final ObjectStorage storage;
    private final AuditService audit;
    public AdminRecords(EntityManager db,MomentRepository moments,MediaAssetRepository assets,UserRepository users,ObjectStorage storage,AuditService audit) {
        this.db=db;this.moments=moments;this.assets=assets;this.users=users;this.storage=storage;this.audit=audit;
    }
    @Transactional(readOnly=true)
    public Page<Account> accounts(String search,int page,int size) {
        paging(page,size);String q=search.trim();
        String predicate=" where u.status=com.lovenotes.server.domain.DomainEnums$UserStatus.ACTIVE";
        Map<String,Object> params=new HashMap<>();
        if(!q.isEmpty()) {
            try {params.put("id",UUID.fromString(q));predicate+=" and u.id=:id";}
            catch(IllegalArgumentException ignored) {params.put("q","%"+q.toLowerCase(Locale.ROOT).replace("!","!!").replace("%","!%").replace("_","!_")+"%");predicate+=" and lower(u.nickname) like :q escape '!'";}
        }
        var query=db.createQuery("select u from UserEntity u"+predicate+" order by u.createdAt desc,u.id desc",UserEntity.class);
        var count=db.createQuery("select count(u) from UserEntity u"+predicate,Long.class);
        params.forEach((name,value)->{query.setParameter(name,value);count.setParameter(name,value);});
        return new Page<>(query.setFirstResult(page*size).setMaxResults(size).getResultList().stream().map(u->new Account(u.getId(),u.getNickname())).toList(),count.getSingleResult(),page,size);
    }
    @Transactional(readOnly=true)
    public Page<RecordView> list(UUID account,String type,String issue,String hidden,int page,int size) {
        requireAccount(account);paging(page,size);
        if(!Set.of("ALL","IMAGE","VIDEO","TEXT").contains(type)||!Set.of("ALL","VISIBLE","HIDDEN").contains(hidden)||!Set.of("ALL","ABNORMAL","UNCHECKED","SOURCE_MISSING","COVER_MISSING","DISPLAY_MISSING","CHECK_FAILED","UNAVAILABLE").contains(issue))throw invalid("筛选条件不正确。");
        String predicate=" where m.authorId=:account and m.status in (com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED,com.lovenotes.server.domain.DomainEnums$MomentStatus.UPLOADING,com.lovenotes.server.domain.DomainEnums$MomentStatus.PARTIAL_FAILED)";
        if(!type.equals("ALL"))predicate+=" and m.type=:type";
        if(!hidden.equals("ALL"))predicate+=" and m.adminHidden="+hidden.equals("HIDDEN");
        if(!issue.equals("ALL"))predicate+=" and "+issuePredicate(issue);
        var query=db.createQuery("select m from MomentEntity m"+predicate+" order by m.occurredAt desc,m.createdAt desc,m.id desc",MomentEntity.class).setParameter("account",account);
        var count=db.createQuery("select count(m) from MomentEntity m"+predicate,Long.class).setParameter("account",account);
        if(!type.equals("ALL")){query.setParameter("type",DomainEnums.MomentType.valueOf(type));count.setParameter("type",DomainEnums.MomentType.valueOf(type));}
        return new Page<>(query.setFirstResult(page*size).setMaxResults(size).getResultList().stream().map(this::view).toList(),count.getSingleResult(),page,size);
    }
    private String issuePredicate(String issue) {
        String check="select c.assetId from AdminMediaCheck c where c.assetId=a.id and c.sourceKey=a.storageKey and (c.displayKey=a.displayStorageKey or (c.displayKey is null and a.displayStorageKey is null)) and (c.thumbnailKey=a.thumbnailStorageKey or (c.thumbnailKey is null and a.thumbnailStorageKey is null))";
        String source="exists ("+check+" and c.sourceState='MISSING')";
        String failed="exists ("+check+" and (c.sourceState='ERROR' or c.displayState='ERROR' or c.thumbnailState='ERROR'))";
        String cover="(a.thumbnailStorageKey is null or exists ("+check+" and c.thumbnailState='MISSING'))";
        String display="exists ("+check+" and c.displayState='MISSING')";
        String unavailable="a.status in (com.lovenotes.server.domain.DomainEnums$MediaStatus.FAILED,com.lovenotes.server.domain.DomainEnums$MediaStatus.BLOCKED,com.lovenotes.server.domain.DomainEnums$MediaStatus.DELETED)";
        String condition=switch(issue) {case "SOURCE_MISSING"->source;case "CHECK_FAILED"->failed;case "COVER_MISSING"->cover;case "DISPLAY_MISSING"->display;case "UNAVAILABLE"->unavailable;case "UNCHECKED"->"not exists ("+check+")";default->"("+source+" or "+failed+" or "+cover+" or "+display+" or "+unavailable+")";};
        return "(exists (select a.id from MediaAssetEntity a where a.momentId=m.id and "+condition+")"+(issue.equals("ABNORMAL")?" or (m.type<>com.lovenotes.server.domain.DomainEnums$MomentType.TEXT and not exists (select a.id from MediaAssetEntity a where a.momentId=m.id))":"")+")";
    }
    @Transactional(readOnly=true)
    public RecordView detail(UUID account,UUID id) { return view(requireRecord(account,id)); }
    @Transactional
    public Map<String,Integer> visibility(UUID account,List<RecordVersion> records,boolean hidden,String operator,String requestId) {
        if(records.isEmpty()||records.size()>500||records.stream().map(RecordVersion::id).distinct().count()!=records.size())throw invalid("请选择 1 至 500 条不同的记录。");
        List<MomentEntity> selected=new ArrayList<>();
        for(var item:records) {
            MomentEntity moment=requireRecord(account,item.id());
            if(moment.getVersion()!=item.version())throw new ApiException(HttpStatus.CONFLICT,"VERSION_CONFLICT","记录已发生变化，请刷新列表后重试。");
            selected.add(moment);
        }
        for(var moment:selected) {
            if(moment.isAdminHidden()==hidden)continue;
            moment.setAdminHidden(hidden);
            audit.record(null,moment.getCoupleId(),"MOMENT",moment.getId(),hidden?"ADMIN_MOMENT_HIDE":"ADMIN_MOMENT_RESTORE","SUCCESS",operator,requestId,Map.of("account_id",account,"operator",operator,"visibility",moment.getVisibility().name()));
        }
        moments.flush();return Map.of("updated",selected.size());
    }
    MomentEntity requireRecord(UUID account,UUID id) {
        MomentEntity moment=moments.findById(id).orElseThrow(AdminRecords::missing);
        if(!moment.getAuthorId().equals(account)||Set.of(DomainEnums.MomentStatus.TRASHED,DomainEnums.MomentStatus.PURGED,DomainEnums.MomentStatus.DRAFT).contains(moment.getStatus()))throw missing();
        return moment;
    }
    void requireAccount(UUID id) {if(users.findById(id).filter(u->u.getStatus()==DomainEnums.UserStatus.ACTIVE).isEmpty())throw missing();}
    private RecordView view(MomentEntity moment) {
        var attached=assets.findByMomentIdOrderByCreatedAtAsc(moment.getId());
        var media=attached.stream().map(this::media).toList();
        var rendered=db.createQuery("select d.renderedMediaAssetId from DerivedAssetEntity d where d.renderedMediaAssetId in (select a.id from MediaAssetEntity a where a.momentId=:id)",UUID.class).setParameter("id",moment.getId()).getResultList();
        UUID cover=attached.stream().filter(a->rendered.contains(a.getId())&&a.getStatus()==DomainEnums.MediaStatus.READY).max(Comparator.comparing(MediaAssetEntity::getCreatedAt)).or(()->attached.stream().filter(a->!rendered.contains(a.getId())).findFirst()).map(MediaAssetEntity::getId).orElse(null);
        String issue=media.stream().map(MediaView::issue).min(Comparator.comparingInt(this::priority)).orElse(moment.getType()==DomainEnums.MomentType.TEXT?"NORMAL":"NO_MEDIA");
        String name=users.findById(moment.getAuthorId()).map(UserEntity::getNickname).orElse("账号不可用");
        var changes=db.createQuery("select x.action,x.reason,x.createdAt from AuditLogEntity x where x.resourceId=:id and x.action in ('ADMIN_MOMENT_HIDE','ADMIN_MOMENT_RESTORE') order by x.createdAt desc",Object[].class).setParameter("id",moment.getId()).setMaxResults(10).getResultList().stream().map(row->Map.of("action",row[0],"operator",Objects.toString(row[1],"管理员"),"created_at",row[2])).toList();
        return new RecordView(moment.getId(),moment.getAuthorId(),name,moment.getType(),moment.getTitle(),moment.getBody(),moment.getOccurredAt(),moment.getVisibility(),moment.getStatus(),moment.getVersion(),moment.isAdminHidden(),issue,cover,media,changes);
    }
    private int priority(String issue) { int n=List.of("SOURCE_MISSING","CHECK_FAILED","UNAVAILABLE","DISPLAY_MISSING","COVER_MISSING","NO_MEDIA","UNCHECKED","NORMAL").indexOf(issue);return n<0?0:n; }
    MediaView media(MediaAssetEntity asset) {
        var check=db.find(AdminMediaCheck.class,asset.getId());if(check!=null&&!check.matches(asset))check=null;
        String source=check==null?"UNCHECKED":check.sourceState,display=check==null?"UNCHECKED":check.displayState,thumbnail=check==null?(asset.getThumbnailStorageKey()==null?"UNSET":"UNCHECKED"):check.thumbnailState;
        String issue="MISSING".equals(source)?"SOURCE_MISSING":List.of(source,display,thumbnail).contains("ERROR")?"CHECK_FAILED":!Set.of(DomainEnums.MediaStatus.READY,DomainEnums.MediaStatus.PROCESSING).contains(asset.getStatus())?"UNAVAILABLE":"MISSING".equals(display)?"DISPLAY_MISSING":Set.of("MISSING","UNSET").contains(thumbnail)?"COVER_MISSING":check==null?"UNCHECKED":"NORMAL";
        boolean ready=asset.getStatus()==DomainEnums.MediaStatus.READY;
        return new MediaView(asset.getId(),asset.getKind(),asset.getStatus(),source,display,thumbnail,issue,check==null?null:check.checkedAt,
                ready&&asset.getThumbnailStorageKey()!=null&&!thumbnail.equals("MISSING")?signed(asset.getThumbnailStorageKey(),asset.getThumbnailStorageKey().endsWith(".jpg")?"image/jpeg":"image/webp"):null,
                ready&&!source.equals("MISSING")?signed(asset.getStorageKey(),asset.getMimeType()):null);
    }
    private String signed(String key,String mime) { try {return storage.signedGetUrl(key,Duration.ofMinutes(5),mime);}catch(Exception ignored){return null;} }
    private void paging(int page,int size) {if(page<0||page>100000||size<1||size>50)throw invalid("分页参数不正确。");}
    static ApiException invalid(String message) { return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR",message); }
    static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND,"RESOURCE_NOT_FOUND","记录或账号不存在。"); }
    public record Account(UUID id,String nickname) {}
    public record Page<T>(List<T> items,long total,int page,int size) {}
    public record RecordVersion(@jakarta.validation.constraints.NotNull UUID id,@jakarta.validation.constraints.Min(0) int version) {}
    public record RecordView(UUID id,UUID accountId,String authorName,DomainEnums.MomentType type,String title,String body,Instant occurredAt,DomainEnums.Visibility visibility,DomainEnums.MomentStatus status,int version,boolean hidden,String issue,UUID coverAssetId,List<MediaView> media,List<Map<String,Object>> operations) {}
    public record MediaView(UUID id,DomainEnums.MediaKind kind,DomainEnums.MediaStatus status,String source,String display,String thumbnail,String issue,Instant checkedAt,String thumbnailUrl,String previewUrl) {}
}
