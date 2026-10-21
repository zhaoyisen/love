package com.lovenotes.server.repository;

import com.lovenotes.server.domain.AppMessageEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.util.*;

public interface AppMessageRepository extends JpaRepository<AppMessageEntity, UUID> {
    String VISIBLE = " and not exists (select m.id from MomentEntity m where m.id=x.momentId and m.adminHidden=true)";
    @Query("select x from AppMessageEntity x where x.recipientId=:recipientId"+VISIBLE+" order by x.createdAt desc")
    List<AppMessageEntity> findByRecipientIdOrderByCreatedAtDesc(@Param("recipientId") UUID recipientId, Pageable pageable);
    @Query("select count(x) from AppMessageEntity x where x.recipientId=:recipientId"+VISIBLE)
    long countByRecipientId(@Param("recipientId") UUID recipientId);
    @Query("select count(x) from AppMessageEntity x where x.recipientId=:recipientId and x.readAt is null"+VISIBLE)
    long countByRecipientIdAndReadAtIsNull(@Param("recipientId") UUID recipientId);
    @Query("select x from AppMessageEntity x where x.recipientId=:recipientId and x.readAt is null"+VISIBLE)
    List<AppMessageEntity> findByRecipientIdAndReadAtIsNull(@Param("recipientId") UUID recipientId);
    @Query("select x from AppMessageEntity x where x.recipientId=:recipientId and x.id=:id"+VISIBLE)
    Optional<AppMessageEntity> findByRecipientIdAndId(@Param("recipientId") UUID recipientId, @Param("id") UUID id);
    Optional<AppMessageEntity> findByRecipientIdAndAggregateKey(UUID recipientId, String aggregateKey);
    long deleteByMomentIdAndActorIdAndTypeAndSourceId(UUID momentId, UUID actorId,
                                                       com.lovenotes.server.domain.DomainEnums.MessageType type, UUID sourceId);
}
