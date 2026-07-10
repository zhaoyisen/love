package com.lovenotes.server.moment;

import com.lovenotes.server.compliance.AuditService;
import com.lovenotes.server.common.*;import com.lovenotes.server.domain.*;import com.lovenotes.server.idempotency.IdempotencyStore;import com.lovenotes.server.repository.*;import com.lovenotes.server.storage.ObjectStorage;import org.springframework.data.domain.PageRequest;import org.springframework.http.HttpStatus;import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;
import com.lovenotes.server.message.MessageService;
import java.time.*;import java.util.*;

@Service
public class MomentService {
    private static final Set<String> MOODS=Set.of("HAPPY","HEARTBEAT","CALM","MISS","WRONGED","ANGRY","RECONCILED","OTHER");
    private static final Set<String> EVENTS=Set.of("DAILY","DATE","TRAVEL","ANNIVERSARY","FIRST","CONFLICT","RECONCILED","GIFT","GROWTH","OTHER");
    private static final Set<String> REACTIONS=Set.of("心动","抱抱","笑哭","懂你","对不起","收藏");
    private final MomentRepository moments;private final MomentTagRepository tags;private final MediaAssetRepository assets;private final MomentReactionRepository reactions;private final MomentCommentRepository comments;private final ActiveCoupleMemberRepository members;private final CoupleSpaceRepository couples;private final IdempotencyStore idempotency;private final TimelineCursorCodec cursors;private final ObjectStorage storage;private final MessageService messages;private final AuditService audit;private final DerivedAssetRepository derivedAssets;
    public MomentService(MomentRepository moments,MomentTagRepository tags,MediaAssetRepository assets,MomentReactionRepository reactions,MomentCommentRepository comments,ActiveCoupleMemberRepository members,CoupleSpaceRepository couples,IdempotencyStore idempotency,TimelineCursorCodec cursors,ObjectStorage storage,MessageService messages,AuditService audit,DerivedAssetRepository derivedAssets){this.moments=moments;this.tags=tags;this.assets=assets;this.reactions=reactions;this.comments=comments;this.members=members;this.couples=couples;this.idempotency=idempotency;this.cursors=cursors;this.storage=storage;this.messages=messages;this.audit=audit;this.derivedAssets=derivedAssets;}

    @Transactional
    public MomentEntity create(UUID actorId,String idempotencyKey,CreateCommand command){
        String key=Hashing.sha256(actorId+":moment:"+idempotencyKey);
        Optional<String> replay=idempotency.get(key);
        if(replay.isPresent())return requireAuthor(actorId,UUID.fromString(replay.get()));
        validate(command);auditText(command.title(),command.body());UUID coupleId=scope(actorId,command.visibility());MediaSelection selection=validateMedia(actorId,command.type(),command.assetIds());List<MediaAssetEntity> media=selection.allAssets();
        DomainEnums.MomentStatus status=selection.sourceAssets().isEmpty()||selection.sourceAssets().stream().allMatch(asset->asset.getStatus()==DomainEnums.MediaStatus.READY)?DomainEnums.MomentStatus.PUBLISHED:DomainEnums.MomentStatus.UPLOADING;
        MomentEntity moment=moments.save(new MomentEntity(actorId,coupleId,command.type(),normalize(command.title()),command.body(),command.occurredAt(),command.visibility(),status));
        if(command.mood()!=null&&!command.mood().isBlank())tags.save(new MomentTagEntity(new MomentTagId(moment.getId(),DomainEnums.TagType.MOOD,command.mood())));
        command.events().forEach(event->tags.save(new MomentTagEntity(new MomentTagId(moment.getId(),DomainEnums.TagType.EVENT,event))));
        media.forEach(asset->{asset.attach(moment.getId());});if(moment.getStatus()==DomainEnums.MomentStatus.PUBLISHED)messages.notifySharedMoment(moment);audit.record(actorId,coupleId,"MOMENT",moment.getId(),"MOMENT_CREATE","SUCCESS",moment.getVisibility().name(),null,Map.of("status",moment.getStatus().name()));idempotency.putIfAbsent(key,moment.getId().toString(),Duration.ofHours(48));return moment;
    }

    @Transactional(readOnly=true)
    public MomentView get(UUID actorId,UUID id){MomentEntity moment=moments.findById(id).orElseThrow(()->notFound());authorizeRead(actorId,moment);return view(actorId,moment);}
    @Transactional(readOnly=true)
    public TimelinePage timeline(UUID actorId,Instant from,Instant to,int limit,String cursorToken){
        if(from.isAfter(to)||limit<1||limit>50)throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","时间范围或分页大小不正确。");
        String queryHash=Hashing.sha256(actorId+"|"+from+"|"+to);
        TimelineCursorCodec.Cursor cursor=cursorToken==null||cursorToken.isBlank()?null:cursors.decode(cursorToken,queryHash);
        var membership=members.findById(actorId);PageRequest page=PageRequest.of(0,limit+1);List<MomentEntity> rows;
        if(membership.isPresent()){
            UUID coupleId=membership.get().getCoupleId();
            rows=cursor==null?moments.timeline(actorId,coupleId,from,to,page):moments.timelineAfter(actorId,coupleId,from,to,cursor.occurredAt(),cursor.createdAt(),cursor.id(),page);
        }else{
            rows=cursor==null?moments.personalTimeline(actorId,from,to,page):moments.personalTimelineAfter(actorId,from,to,cursor.occurredAt(),cursor.createdAt(),cursor.id(),page);
        }
        boolean hasMore=rows.size()>limit;List<MomentEntity> selected=hasMore?rows.subList(0,limit):rows;
        String nextCursor=null;
        if(hasMore&&!selected.isEmpty()){
            MomentEntity last=selected.getLast();
            nextCursor=cursors.encode(new TimelineCursorCodec.Cursor(last.getOccurredAt(),last.getCreatedAt(),last.getId()),queryHash);
        }
        return new TimelinePage(selected.stream().map(moment->view(actorId,moment)).toList(),nextCursor,hasMore);
    }
    @Transactional
    public MomentEntity update(UUID actorId,UUID id,int version,String title,String body,Instant occurredAt,DomainEnums.Visibility visibility,String mood,List<String> events){MomentEntity moment=requireAuthor(actorId,id);if(moment.getVersion()!=version)throw versionConflict(moment.getVersion());DomainEnums.Visibility oldVisibility=moment.getVisibility();UUID oldCoupleId=moment.getCoupleId();CreateCommand command=new CreateCommand(moment.getType(),title,body,occurredAt,visibility,mood,events==null?List.of():events,List.of());validate(command);auditText(title,body);UUID coupleId=scope(actorId,visibility);moment.update(normalize(title),body,occurredAt,visibility,coupleId);if(oldVisibility!=visibility||!Objects.equals(oldCoupleId,coupleId))audit.record(actorId,coupleId,"MOMENT",moment.getId(),"MOMENT_VISIBILITY_CHANGE","SUCCESS",oldVisibility.name()+"->"+visibility.name(),null,Map.of("old_couple_id",oldCoupleId==null?"":oldCoupleId.toString(),"new_couple_id",coupleId==null?"":coupleId.toString()));tags.deleteByIdMomentId(id);if(mood!=null&&!mood.isBlank())tags.save(new MomentTagEntity(new MomentTagId(id,DomainEnums.TagType.MOOD,mood)));command.events().forEach(event->tags.save(new MomentTagEntity(new MomentTagId(id,DomainEnums.TagType.EVENT,event))));return moment;}
    @Transactional public void trash(UUID actorId,UUID id,int version){MomentEntity moment=requireAuthor(actorId,id);if(moment.getVersion()!=version)throw versionConflict(moment.getVersion());UUID coupleId=moment.getCoupleId();moment.trash();audit.record(actorId,coupleId,"MOMENT",moment.getId(),"MOMENT_TRASH","SUCCESS",null,null,Map.of());}
    @Transactional public MomentEntity restore(UUID actorId,UUID id){MomentEntity moment=requireAuthor(actorId,id);if(moment.getStatus()!=DomainEnums.MomentStatus.TRASHED)throw new ApiException(HttpStatus.CONFLICT,"MOMENT_NOT_TRASHED","这条记录不在回收站中。");UUID oldCoupleId=moment.getCoupleId();DomainEnums.Visibility oldVisibility=moment.getVisibility();boolean keepShared=moment.getVisibility()==DomainEnums.Visibility.SHARED&&members.findById(actorId).map(m->m.getCoupleId().equals(moment.getCoupleId())).orElse(false);moment.restore(keepShared);audit.record(actorId,moment.getCoupleId(),"MOMENT",moment.getId(),"MOMENT_RESTORE","SUCCESS",oldVisibility.name()+"->"+moment.getVisibility().name(),null,Map.of("old_couple_id",oldCoupleId==null?"":oldCoupleId.toString(),"new_couple_id",moment.getCoupleId()==null?"":moment.getCoupleId().toString()));return moment;}
    @Transactional(readOnly=true) public List<MomentView> trash(UUID actorId){return moments.findByAuthorIdAndStatusOrderByDeletedAtDesc(actorId,DomainEnums.MomentStatus.TRASHED).stream().map(moment->view(actorId,moment)).toList();}
    @Transactional public MomentView react(UUID actorId,UUID id,String value){MomentEntity moment=requireInteractable(actorId,id);String normalized=value==null?"":value.trim();if(!REACTIONS.contains(normalized))throw validation("回应类型不正确。");boolean[] changed={false};reactions.findByMomentIdAndActorId(id,actorId).ifPresentOrElse(reaction->{if(!reaction.getValue().equals(normalized)){reaction.updateValue(normalized);changed[0]=true;}},()->{reactions.save(new MomentReactionEntity(id,actorId,normalized));changed[0]=true;});if(changed[0])messages.notifyReaction(moment,actorId,normalized);return view(actorId,moment);}
    @Transactional public MomentView comment(UUID actorId,UUID id,String idempotencyKey,String body){MomentEntity moment=requireInteractable(actorId,id);String key=Hashing.sha256(actorId+":comment:"+id+":"+idempotencyKey);if(idempotency.get(key).isPresent())return view(actorId,moment);String normalized=normalizeComment(body);auditText(null,normalized);MomentCommentEntity comment=comments.save(new MomentCommentEntity(id,actorId,normalized));messages.notifyComment(moment,comment);idempotency.putIfAbsent(key,comment.getId().toString(),Duration.ofHours(48));return view(actorId,moment);}
    @Transactional public MomentView deleteComment(UUID actorId,UUID momentId,UUID commentId){MomentEntity moment=requireInteractable(actorId,momentId);MomentCommentEntity comment=comments.findById(commentId).orElseThrow(()->notFound());if(!comment.getMomentId().equals(moment.getId())||!comment.getAuthorId().equals(actorId))throw forbidden();comments.delete(comment);long retracted=messages.retractCommentNotifications(comment);audit.record(actorId,moment.getCoupleId(),"MOMENT_COMMENT",comment.getId(),"MOMENT_COMMENT_DELETE","SUCCESS",null,null,Map.of("moment_id",moment.getId().toString(),"retracted_notifications",retracted));return view(actorId,moment);}

    private void validate(CreateCommand c){if(c.body()==null||c.body().codePointCount(0,c.body().length())>1000)throw validation("正文最多 1000 字。");if(c.title()!=null&&c.title().codePointCount(0,c.title().length())>30)throw validation("标题最多 30 字。");if(c.occurredAt()==null||c.occurredAt().isAfter(Instant.now().plus(Duration.ofMinutes(5))))throw validation("发生时间不能晚于当前时间 5 分钟。");if(c.events()==null||c.events().size()>3||c.events().stream().anyMatch(e->!EVENTS.contains(e)))throw validation("事件标签不正确或超过 3 个。");if(c.mood()!=null&&!c.mood().isBlank()&&!MOODS.contains(c.mood()))throw validation("心情标签不正确。");}
    private MediaSelection validateMedia(UUID actorId,DomainEnums.MomentType type,List<UUID> ids){
        List<UUID> safe=ids==null?List.of():ids;
        if(new HashSet<>(safe).size()!=safe.size())throw validation("媒体不能重复选择。");
        if(type==DomainEnums.MomentType.TEXT&&!safe.isEmpty())throw validation("纯文字记录不能包含媒体。");
        if(type==DomainEnums.MomentType.VIDEO&&safe.size()!=1)throw validation("视频记录只能包含一个视频。");
        List<MediaAssetEntity> media=assets.findByIdIn(safe);if(media.size()!=safe.size())throw validation("媒体不存在或尚未上传完成。");
        Map<UUID,DerivedAssetEntity> renders=derivedAssets.findByRenderedMediaAssetIdIn(safe).stream()
                .collect(java.util.stream.Collectors.toMap(DerivedAssetEntity::getRenderedMediaAssetId,asset->asset));
        if(type!=DomainEnums.MomentType.IMAGE&&!renders.isEmpty())throw validation("只有图片记录可以使用模板成图。");
        List<MediaAssetEntity> sourceAssets=media.stream().filter(asset->!renders.containsKey(asset.getId())).toList();
        if(type==DomainEnums.MomentType.IMAGE&&(sourceAssets.isEmpty()||sourceAssets.size()>9))throw validation("图片记录需要 1 至 9 张原始图片。");
        for(var asset:media){if(!asset.getUploaderId().equals(actorId)||asset.getMomentId()!=null||!Set.of(DomainEnums.MediaStatus.READY,DomainEnums.MediaStatus.PROCESSING).contains(asset.getStatus()))throw validation("媒体不存在、尚未上传完成或已经用于其他记录。");if(type==DomainEnums.MomentType.IMAGE&&asset.getKind()!=DomainEnums.MediaKind.IMAGE)throw validation("图片记录只能使用图片。");if(type==DomainEnums.MomentType.VIDEO&&asset.getKind()!=DomainEnums.MediaKind.VIDEO)throw validation("视频记录只能使用视频。");}
        for(var render:renders.values()){if(!render.getOwnerId().equals(actorId)||render.getSourceAssetIds().isEmpty()||!safe.containsAll(render.getSourceAssetIds()))throw validation("模板成图和源图片不匹配。");}
        return new MediaSelection(media,sourceAssets);
    }
    private UUID scope(UUID actorId,DomainEnums.Visibility visibility){if(visibility==DomainEnums.Visibility.PRIVATE)return null;var membership=members.findById(actorId).orElseThrow(()->new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"VISIBILITY_NOT_ALLOWED","完成配对后才能设为共同可见。"));var couple=couples.findById(membership.getCoupleId()).orElseThrow();if(couple.getStatus()!=DomainEnums.CoupleStatus.PAIRED)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"VISIBILITY_NOT_ALLOWED","情侣空间当前不可共享内容。");return couple.getId();}
    private void authorizeRead(UUID actorId,MomentEntity moment){if(moment.getStatus()==DomainEnums.MomentStatus.TRASHED||moment.getStatus()==DomainEnums.MomentStatus.PURGED)throw forbidden();if(moment.getAuthorId().equals(actorId))return;if(moment.getStatus()!=DomainEnums.MomentStatus.PUBLISHED||moment.getVisibility()!=DomainEnums.Visibility.SHARED)throw forbidden();boolean active=members.findById(actorId).map(m->m.getCoupleId().equals(moment.getCoupleId())).orElse(false);if(!active)throw forbidden();}
    private MomentEntity requireAuthor(UUID actorId,UUID id){MomentEntity moment=moments.findById(id).orElseThrow(()->notFound());if(!moment.getAuthorId().equals(actorId))throw forbidden();return moment;}
    private MomentEntity requireInteractable(UUID actorId,UUID id){MomentEntity moment=moments.findById(id).orElseThrow(()->notFound());boolean active=moment.getCoupleId()!=null&&members.findById(actorId).map(m->m.getCoupleId().equals(moment.getCoupleId())).orElse(false);if(moment.getStatus()!=DomainEnums.MomentStatus.PUBLISHED||moment.getVisibility()!=DomainEnums.Visibility.SHARED||!active)throw new ApiException(HttpStatus.FORBIDDEN,"INTERACTION_NOT_ALLOWED","只有当前情侣空间内的共同可见记录可以互动。");return moment;}
    private MomentView view(UUID actorId,MomentEntity m){
        List<MomentTagEntity> all=tags.findByIdMomentId(m.getId());String mood=all.stream().filter(t->t.getId().getTagType()==DomainEnums.TagType.MOOD).map(t->t.getId().getTagValue()).findFirst().orElse(null);List<String> events=all.stream().filter(t->t.getId().getTagType()==DomainEnums.TagType.EVENT).map(t->t.getId().getTagValue()).toList();
        List<MediaAssetEntity> attached=assets.findByMomentIdOrderByCreatedAtAsc(m.getId());
        Map<UUID,DerivedAssetEntity> renders=derivedAssets.findByRenderedMediaAssetIdIn(attached.stream().map(MediaAssetEntity::getId).toList()).stream().collect(java.util.stream.Collectors.toMap(DerivedAssetEntity::getRenderedMediaAssetId,asset->asset));
        MediaAssetEntity rendered=attached.stream().filter(asset->renders.containsKey(asset.getId())&&asset.getStatus()==DomainEnums.MediaStatus.READY).max(Comparator.comparing(MediaAssetEntity::getCreatedAt)).orElse(null);
        DerivedAssetEntity template=rendered==null?null:renders.get(rendered.getId());
        List<MediaAssetEntity> displayAssets=rendered==null?attached.stream().filter(asset->!renders.containsKey(asset.getId())).toList():List.of(rendered);
        List<MediaView> media=displayAssets.stream().map(this::mediaView).toList();
        TemplateView templateView=template==null?null:new TemplateView(template.getId(),template.getTemplateId(),template.getTemplateVersion(),template.getStatus(),template.getSourceAssetIds());
        List<ReactionView> reactionViews=reactions.findByMomentIdOrderByUpdatedAtAsc(m.getId()).stream().map(reaction->new ReactionView(reaction.getActorId(),reaction.getValue(),reaction.getCreatedAt(),reaction.getUpdatedAt())).toList();ReactionView myReaction=reactionViews.stream().filter(reaction->reaction.actorId().equals(actorId)).findFirst().orElse(null);List<CommentView> commentViews=comments.findByMomentIdOrderByCreatedAtAsc(m.getId()).stream().map(comment->new CommentView(comment.getId(),comment.getAuthorId(),comment.getBody(),comment.getCreatedAt())).toList();return new MomentView(m.getId(),m.getAuthorId(),m.getType(),m.getTitle(),m.getBody(),m.getOccurredAt(),m.getVisibility(),m.getStatus(),m.getVersion(),m.getDeletedAt(),mood,events,media,templateView,myReaction,reactionViews,commentViews);
    }
    private MediaView mediaView(MediaAssetEntity asset){boolean ready=asset.getStatus()==DomainEnums.MediaStatus.READY;String displayKey=asset.getDisplayStorageKey()==null?asset.getStorageKey():asset.getDisplayStorageKey();return new MediaView(asset.getId(),asset.getKind(),asset.getStatus(),ready?storage.signedGetUrl(displayKey,Duration.ofMinutes(5)):null,ready&&asset.getThumbnailStorageKey()!=null?storage.signedGetUrl(asset.getThumbnailStorageKey(),Duration.ofMinutes(5)):null);}
    private String normalize(String title){return title==null||title.isBlank()?null:title.trim();}
    private String normalizeComment(String body){String normalized=body==null?"":body.trim();if(normalized.isBlank())throw validation("短评不能为空。");if(normalized.codePointCount(0,normalized.length())>300)throw validation("短评最多 300 字。");return normalized;}
    private void auditText(String title,String body){if(!storage.requiresProcessing())return;ObjectStorage.ProcessingOutcome outcome=storage.auditText((title==null?"":title)+"\n"+body);if(outcome==ObjectStorage.ProcessingOutcome.BLOCKED)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"CONTENT_BLOCKED","文字内容未通过安全检测，请修改后重试。");if(outcome!=ObjectStorage.ProcessingOutcome.READY)throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE,"PROVIDER_UNAVAILABLE","文字内容安全检测暂时不可用，请稍后重试。");}
    private ApiException validation(String message){return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR",message);}
    private ApiException forbidden(){return new ApiException(HttpStatus.FORBIDDEN,"RESOURCE_FORBIDDEN","内容不存在或当前不可访问。");}
    private ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"RESOURCE_NOT_FOUND","内容不存在或当前不可访问。");}
    private ApiException versionConflict(int current){return new ApiException(HttpStatus.CONFLICT,"VERSION_CONFLICT","内容已在另一台设备更新，请刷新后重试。",Map.of("current_version",current));}
    private record MediaSelection(List<MediaAssetEntity> allAssets,List<MediaAssetEntity> sourceAssets) {}
    public record CreateCommand(DomainEnums.MomentType type,String title,String body,Instant occurredAt,DomainEnums.Visibility visibility,String mood,List<String> events,List<UUID> assetIds){}
    public record TimelinePage(List<MomentView> items,String nextCursor,boolean hasMore){}
    public record MediaView(UUID id,DomainEnums.MediaKind kind,DomainEnums.MediaStatus status,String accessUrl,String thumbnailUrl){}
    public record ReactionView(UUID actorId,String value,Instant createdAt,Instant updatedAt){}
    public record CommentView(UUID id,UUID authorId,String body,Instant createdAt){}
    public record TemplateView(UUID id,String templateId,Integer templateVersion,DomainEnums.DerivedAssetStatus status,List<UUID> sourceAssetIds){}
    public record MomentView(UUID id,UUID authorId,DomainEnums.MomentType type,String title,String body,Instant occurredAt,DomainEnums.Visibility visibility,DomainEnums.MomentStatus status,int version,Instant deletedAt,String mood,List<String> events,List<MediaView> media,TemplateView template,ReactionView myReaction,List<ReactionView> reactions,List<CommentView> comments){}
}
