package com.lovenotes.server.sync;

import com.lovenotes.server.auth.Actor;
import com.lovenotes.server.auth.AuthFilter;
import com.lovenotes.server.common.ApiResponse;
import com.lovenotes.server.common.Hashing;
import com.lovenotes.server.common.RequestContext;
import com.lovenotes.server.repository.ActiveCoupleMemberRepository;
import jakarta.persistence.EntityManager;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.*;

@RestController
public class SyncController {
    private final EntityManager entities;
    private final ActiveCoupleMemberRepository members;

    public SyncController(EntityManager entities, ActiveCoupleMemberRepository members) {
        this.entities = entities; this.members = members;
    }

    @GetMapping("/sync/version")
    @Transactional(readOnly = true)
    ApiResponse<Version> version(@RequestAttribute(AuthFilter.ACTOR_ATTRIBUTE) Actor actor, HttpServletRequest request) {
        UUID couple = members.findById(actor.userId()).map(member -> member.getCoupleId()).orElse(new UUID(0, 0));
        List<UUID> people = new ArrayList<>();people.add(actor.userId());
        members.findByCoupleId(couple).forEach(member -> { if (!people.contains(member.getUserId())) people.add(member.getUserId()); });
        Map<String,Object> params = Map.of("actor",actor.userId(),"couple",couple,"people",people);
        String visible = "select m.id from MomentEntity m where m.authorId=:actor or (m.coupleId=:couple and m.visibility=com.lovenotes.server.domain.DomainEnums$Visibility.SHARED and m.status=com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED)";
        StringBuilder fingerprint = new StringBuilder(actor.userId()+":"+couple);
        fingerprint.append(stats("UserEntity", "x.id in :people", "x.updatedAt", params));
        fingerprint.append(stats("CoupleSpaceEntity", "x.id=:couple", "x.updatedAt", params));
        fingerprint.append(stats("MomentEntity", "x.id in ("+visible+")", "x.updatedAt", params));
        fingerprint.append(stats("MomentReactionEntity", "x.momentId in ("+visible+")", "x.updatedAt", params));
        fingerprint.append(stats("MomentCommentEntity", "x.momentId in ("+visible+")", "x.createdAt", params));
        // shortcut: probes read visible tag/media metadata; use write-side revision counters for large libraries.
        fingerprint.append("|tags:").append(values("select x.id.momentId, x.id.tagType, x.id.tagValue from MomentTagEntity x where x.id.momentId in ("+visible+") order by x.id.momentId, x.id.tagType, x.id.tagValue", params));
        String mediaScope = "x.uploaderId=:actor or (x.status=com.lovenotes.server.domain.DomainEnums$MediaStatus.READY and (x.albumCoupleId=:couple or x.momentId in ("+visible+") or x.id in (select u.avatarMediaId from UserEntity u where u.id in :people)))";
        // 补图重试会更新时间；仅实际媒体状态、归属或文件变化才失效缓存。
        fingerprint.append("|media:").append(values("select x.id, x.status, x.albumCoupleId, x.momentId, x.profileAvatar, x.storageKey, x.displayStorageKey, x.thumbnailStorageKey from MediaAssetEntity x where "+mediaScope+" order by x.id", params));
        fingerprint.append("|messages:").append(values("select count(x), max(x.updatedAt), max(x.readAt) from AppMessageEntity x where x.recipientId=:actor", params));
        fingerprint.append(stats("NotificationPreferenceEntity", "x.userId=:actor", "x.updatedAt", params));
        fingerprint.append(stats("PetStateEntity", "x.coupleId=:couple", "x.updatedAt", params));
        fingerprint.append(stats("PetAdoptionProposalEntity", "x.coupleId=:couple", "x.updatedAt", params));
        fingerprint.append(stats("AnnualRecapEntity", "x.coupleId=:couple", "x.updatedAt", params));
        return ApiResponse.ok(new Version(Hashing.sha256(fingerprint.toString())), RequestContext.requestId(request));
    }

    private String stats(String entity, String predicate, String time, Map<String,Object> params) {
        return "|"+entity+":"+values("select count(x), max("+time+") from "+entity+" x where "+predicate, params);
    }

    private String values(String jpql, Map<String,Object> params) {
        var query = entities.createQuery(jpql);
        query.getParameters().forEach(parameter -> query.setParameter(parameter.getName(), params.get(parameter.getName())));
        StringBuilder result = new StringBuilder();
        for (Object row : query.getResultList()) result.append(Arrays.toString((Object[])row)).append(';');
        return result.toString();
    }

    public record Version(String version) {}
}
