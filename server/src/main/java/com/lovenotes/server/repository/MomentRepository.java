package com.lovenotes.server.repository;
import com.lovenotes.server.domain.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import java.time.Instant;
import java.util.*;
public interface MomentRepository extends JpaRepository<MomentEntity, UUID> {
    @Query("select m from MomentEntity m where m.adminHidden=false and m.coupleId=:couple and m.visibility=com.lovenotes.server.domain.DomainEnums$Visibility.SHARED and m.status=com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED and m.type=com.lovenotes.server.domain.DomainEnums$MomentType.IMAGE and exists (select a.id from MediaAssetEntity a where a.momentId=m.id and a.kind=com.lovenotes.server.domain.DomainEnums$MediaKind.IMAGE and a.status=com.lovenotes.server.domain.DomainEnums$MediaStatus.READY and not exists (select d.id from DerivedAssetEntity d where d.renderedMediaAssetId=a.id)) order by m.occurredAt desc, m.createdAt desc, m.id desc")
    List<MomentEntity> album(@Param("couple") UUID couple, Pageable pageable);
    List<MomentEntity> findByAuthorIdAndStatusOrderByDeletedAtDesc(UUID authorId, DomainEnums.MomentStatus status);
    List<MomentEntity> findByAuthorIdAndStatusInOrderByCreatedAtAsc(UUID authorId, Collection<DomainEnums.MomentStatus> statuses);
    List<MomentEntity> findByCoupleIdAndVisibilityAndStatusAndOccurredAtBetweenOrderByOccurredAtDescCreatedAtDesc(
            UUID coupleId, DomainEnums.Visibility visibility, DomainEnums.MomentStatus status, Instant from, Instant to);
    List<MomentEntity> findTop100ByStatusAndDeletedAtBeforeOrderByDeletedAtAsc(
            DomainEnums.MomentStatus status, Instant deletedBefore);
    @Query("select m from MomentEntity m where m.adminHidden=false and m.occurredAt between :from and :to and ((m.authorId=:actor and m.status in (com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED,com.lovenotes.server.domain.DomainEnums$MomentStatus.UPLOADING,com.lovenotes.server.domain.DomainEnums$MomentStatus.PARTIAL_FAILED)) or (m.status=com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED and m.coupleId=:couple and m.visibility=com.lovenotes.server.domain.DomainEnums$Visibility.SHARED)) order by m.occurredAt desc, m.createdAt desc, m.id desc")
    List<MomentEntity> timeline(@Param("actor") UUID actor, @Param("couple") UUID couple, @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
    @Query("select m from MomentEntity m where m.adminHidden=false and m.status in (com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED,com.lovenotes.server.domain.DomainEnums$MomentStatus.UPLOADING,com.lovenotes.server.domain.DomainEnums$MomentStatus.PARTIAL_FAILED) and m.occurredAt between :from and :to and m.authorId=:actor order by m.occurredAt desc, m.createdAt desc, m.id desc")
    List<MomentEntity> personalTimeline(@Param("actor") UUID actor, @Param("from") Instant from, @Param("to") Instant to, Pageable pageable);
    @Query(value = """
            select m.* from moment m
            where m.admin_hidden=false and m.occurred_at between :from and :to
              and ((m.author_id=:actor and m.status in ('PUBLISHED','UPLOADING','PARTIAL_FAILED'))
                or (m.status='PUBLISHED' and m.couple_id=:couple and m.visibility='SHARED'))
              and (m.occurred_at < :cursorOccurred
                or (m.occurred_at = :cursorOccurred and m.created_at < :cursorCreated)
                or (m.occurred_at = :cursorOccurred and m.created_at = :cursorCreated and m.id < :cursorId))
            order by m.occurred_at desc, m.created_at desc, m.id desc
            """, nativeQuery = true)
    List<MomentEntity> timelineAfter(@Param("actor") UUID actor, @Param("couple") UUID couple,
                                     @Param("from") Instant from, @Param("to") Instant to,
                                     @Param("cursorOccurred") Instant cursorOccurred,
                                     @Param("cursorCreated") Instant cursorCreated,
                                     @Param("cursorId") UUID cursorId, Pageable pageable);
    @Query(value = """
            select m.* from moment m
            where m.admin_hidden=false and m.status in ('PUBLISHED','UPLOADING','PARTIAL_FAILED') and m.occurred_at between :from and :to and m.author_id=:actor
              and (m.occurred_at < :cursorOccurred
                or (m.occurred_at = :cursorOccurred and m.created_at < :cursorCreated)
                or (m.occurred_at = :cursorOccurred and m.created_at = :cursorCreated and m.id < :cursorId))
            order by m.occurred_at desc, m.created_at desc, m.id desc
            """, nativeQuery = true)
    List<MomentEntity> personalTimelineAfter(@Param("actor") UUID actor,
                                             @Param("from") Instant from, @Param("to") Instant to,
                                             @Param("cursorOccurred") Instant cursorOccurred,
                                             @Param("cursorCreated") Instant cursorCreated,
                                             @Param("cursorId") UUID cursorId, Pageable pageable);
}
