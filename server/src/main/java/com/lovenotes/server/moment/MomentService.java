package com.lovenotes.server.moment;

import com.lovenotes.server.common.*;import com.lovenotes.server.domain.*;import com.lovenotes.server.idempotency.IdempotencyStore;import com.lovenotes.server.repository.*;import org.springframework.data.domain.PageRequest;import org.springframework.http.HttpStatus;import org.springframework.stereotype.Service;import org.springframework.transaction.annotation.Transactional;
import java.time.*;import java.util.*;

@Service
public class MomentService {
    private static final Set<String> MOODS=Set.of("HAPPY","HEARTBEAT","CALM","MISS","WRONGED","ANGRY","RECONCILED","OTHER");
    private static final Set<String> EVENTS=Set.of("DAILY","DATE","TRAVEL","ANNIVERSARY","FIRST","CONFLICT","RECONCILED","GIFT","GROWTH","OTHER");
    private final MomentRepository moments;private final MomentTagRepository tags;private final MediaAssetRepository assets;private final ActiveCoupleMemberRepository members;private final CoupleSpaceRepository couples;private final IdempotencyStore idempotency;
    public MomentService(MomentRepository moments,MomentTagRepository tags,MediaAssetRepository assets,ActiveCoupleMemberRepository members,CoupleSpaceRepository couples,IdempotencyStore idempotency){this.moments=moments;this.tags=tags;this.assets=assets;this.members=members;this.couples=couples;this.idempotency=idempotency;}

    @Transactional
    public MomentEntity create(UUID actorId,String idempotencyKey,CreateCommand command){
        String key=Hashing.sha256(actorId+":moment:"+idempotencyKey);
        Optional<String> replay=idempotency.get(key);
        if(replay.isPresent())return requireAuthor(actorId,UUID.fromString(replay.get()));
        validate(command);UUID coupleId=scope(actorId,command.visibility());List<MediaAssetEntity> media=validateMedia(actorId,command.type(),command.assetIds());
        DomainEnums.MomentStatus status=media.isEmpty()?DomainEnums.MomentStatus.PUBLISHED:DomainEnums.MomentStatus.UPLOADING;
        MomentEntity moment=moments.save(new MomentEntity(actorId,coupleId,command.type(),normalize(command.title()),command.body(),command.occurredAt(),command.visibility(),status));
        if(command.mood()!=null&&!command.mood().isBlank())tags.save(new MomentTagEntity(new MomentTagId(moment.getId(),DomainEnums.TagType.MOOD,command.mood())));
        command.events().forEach(event->tags.save(new MomentTagEntity(new MomentTagId(moment.getId(),DomainEnums.TagType.EVENT,event))));
        media.forEach(asset->{asset.attach(moment.getId());});idempotency.putIfAbsent(key,moment.getId().toString(),Duration.ofHours(48));return moment;
    }

    @Transactional(readOnly=true)
    public MomentView get(UUID actorId,UUID id){MomentEntity moment=moments.findById(id).orElseThrow(()->notFound());authorizeRead(actorId,moment);return view(moment);}
    @Transactional(readOnly=true)
    public List<MomentView> timeline(UUID actorId,Instant from,Instant to,int limit){if(from.isAfter(to)||limit<1||limit>50)throw new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR","时间范围或分页大小不正确。");var membership=members.findById(actorId);List<MomentEntity> list=membership.isPresent()?moments.timeline(actorId,membership.get().getCoupleId(),from,to,PageRequest.of(0,limit)):moments.personalTimeline(actorId,from,to,PageRequest.of(0,limit));return list.stream().map(this::view).toList();}
    @Transactional
    public MomentEntity update(UUID actorId,UUID id,int version,String title,String body,Instant occurredAt,DomainEnums.Visibility visibility){MomentEntity moment=requireAuthor(actorId,id);if(moment.getVersion()!=version)throw versionConflict(moment.getVersion());if(body==null||body.codePointCount(0,body.length())>1000)throw validation("正文最多 1000 字。");if(occurredAt.isAfter(Instant.now().plus(Duration.ofMinutes(5))))throw validation("发生时间不能晚于当前时间 5 分钟。");UUID coupleId=scope(actorId,visibility);moment.update(normalize(title),body,occurredAt,visibility,coupleId);return moment;}
    @Transactional public void trash(UUID actorId,UUID id,int version){MomentEntity moment=requireAuthor(actorId,id);if(moment.getVersion()!=version)throw versionConflict(moment.getVersion());moment.trash();}
    @Transactional public MomentEntity restore(UUID actorId,UUID id){MomentEntity moment=requireAuthor(actorId,id);if(moment.getStatus()!=DomainEnums.MomentStatus.TRASHED)throw new ApiException(HttpStatus.CONFLICT,"MOMENT_NOT_TRASHED","这条记录不在回收站中。");boolean keepShared=moment.getVisibility()==DomainEnums.Visibility.SHARED&&members.findById(actorId).map(m->m.getCoupleId().equals(moment.getCoupleId())).orElse(false);moment.restore(keepShared);return moment;}

    private void validate(CreateCommand c){if(c.body()==null||c.body().codePointCount(0,c.body().length())>1000)throw validation("正文最多 1000 字。");if(c.title()!=null&&c.title().codePointCount(0,c.title().length())>30)throw validation("标题最多 30 字。");if(c.occurredAt()==null||c.occurredAt().isAfter(Instant.now().plus(Duration.ofMinutes(5))))throw validation("发生时间不能晚于当前时间 5 分钟。");if(c.events()==null||c.events().size()>3||c.events().stream().anyMatch(e->!EVENTS.contains(e)))throw validation("事件标签不正确或超过 3 个。");if(c.mood()!=null&&!c.mood().isBlank()&&!MOODS.contains(c.mood()))throw validation("心情标签不正确。");}
    private List<MediaAssetEntity> validateMedia(UUID actorId,DomainEnums.MomentType type,List<UUID> ids){List<UUID> safe=ids==null?List.of():ids;if(type==DomainEnums.MomentType.TEXT&&!safe.isEmpty())throw validation("纯文字记录不能包含媒体。");if(type==DomainEnums.MomentType.IMAGE&&(safe.isEmpty()||safe.size()>9))throw validation("图片记录需要 1 至 9 张图片。");if(type==DomainEnums.MomentType.VIDEO&&safe.size()!=1)throw validation("视频记录只能包含一个视频。");List<MediaAssetEntity> media=assets.findByIdIn(safe);if(media.size()!=safe.size())throw validation("媒体不存在或尚未上传完成。");for(var asset:media){if(!asset.getUploaderId().equals(actorId)||asset.getStatus()!=DomainEnums.MediaStatus.UPLOADED)throw validation("媒体不存在或尚未上传完成。");if(type==DomainEnums.MomentType.IMAGE&&asset.getKind()!=DomainEnums.MediaKind.IMAGE)throw validation("图片记录只能使用图片。");if(type==DomainEnums.MomentType.VIDEO&&asset.getKind()!=DomainEnums.MediaKind.VIDEO)throw validation("视频记录只能使用视频。");}return media;}
    private UUID scope(UUID actorId,DomainEnums.Visibility visibility){if(visibility==DomainEnums.Visibility.PRIVATE)return null;var membership=members.findById(actorId).orElseThrow(()->new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"VISIBILITY_NOT_ALLOWED","完成配对后才能设为共同可见。"));var couple=couples.findById(membership.getCoupleId()).orElseThrow();if(couple.getStatus()!=DomainEnums.CoupleStatus.PAIRED)throw new ApiException(HttpStatus.UNPROCESSABLE_ENTITY,"VISIBILITY_NOT_ALLOWED","情侣空间当前不可共享内容。");return couple.getId();}
    private void authorizeRead(UUID actorId,MomentEntity moment){if(moment.getStatus()==DomainEnums.MomentStatus.TRASHED||moment.getStatus()==DomainEnums.MomentStatus.PURGED)throw forbidden();if(moment.getAuthorId().equals(actorId))return;if(moment.getStatus()!=DomainEnums.MomentStatus.PUBLISHED||moment.getVisibility()!=DomainEnums.Visibility.SHARED)throw forbidden();boolean active=members.findById(actorId).map(m->m.getCoupleId().equals(moment.getCoupleId())).orElse(false);if(!active)throw forbidden();}
    private MomentEntity requireAuthor(UUID actorId,UUID id){MomentEntity moment=moments.findById(id).orElseThrow(()->notFound());if(!moment.getAuthorId().equals(actorId))throw forbidden();return moment;}
    private MomentView view(MomentEntity m){List<MomentTagEntity> all=tags.findByIdMomentId(m.getId());String mood=all.stream().filter(t->t.getId().getTagType()==DomainEnums.TagType.MOOD).map(t->t.getId().getTagValue()).findFirst().orElse(null);List<String> events=all.stream().filter(t->t.getId().getTagType()==DomainEnums.TagType.EVENT).map(t->t.getId().getTagValue()).toList();return new MomentView(m.getId(),m.getAuthorId(),m.getType(),m.getTitle(),m.getBody(),m.getOccurredAt(),m.getVisibility(),m.getStatus(),m.getVersion(),mood,events);}
    private String normalize(String title){return title==null||title.isBlank()?null:title.trim();}
    private ApiException validation(String message){return new ApiException(HttpStatus.BAD_REQUEST,"VALIDATION_ERROR",message);}
    private ApiException forbidden(){return new ApiException(HttpStatus.FORBIDDEN,"RESOURCE_FORBIDDEN","内容不存在或当前不可访问。");}
    private ApiException notFound(){return new ApiException(HttpStatus.NOT_FOUND,"RESOURCE_NOT_FOUND","内容不存在或当前不可访问。");}
    private ApiException versionConflict(int current){return new ApiException(HttpStatus.CONFLICT,"VERSION_CONFLICT","内容已在另一台设备更新，请刷新后重试。",Map.of("current_version",current));}
    public record CreateCommand(DomainEnums.MomentType type,String title,String body,Instant occurredAt,DomainEnums.Visibility visibility,String mood,List<String> events,List<UUID> assetIds){}
    public record MomentView(UUID id,UUID authorId,DomainEnums.MomentType type,String title,String body,Instant occurredAt,DomainEnums.Visibility visibility,DomainEnums.MomentStatus status,int version,String mood,List<String> events){}
}
