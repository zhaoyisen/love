package com.lovenotes.server.repository;

import com.lovenotes.server.domain.AppMessageEntity;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface AppMessageRepository extends JpaRepository<AppMessageEntity, UUID> {
    List<AppMessageEntity> findByRecipientIdOrderByCreatedAtDesc(UUID recipientId, Pageable pageable);
    long countByRecipientIdAndReadAtIsNull(UUID recipientId);
    List<AppMessageEntity> findByRecipientIdAndReadAtIsNull(UUID recipientId);
    Optional<AppMessageEntity> findByRecipientIdAndId(UUID recipientId, UUID id);
    Optional<AppMessageEntity> findByRecipientIdAndAggregateKey(UUID recipientId, String aggregateKey);
    long deleteByMomentIdAndActorIdAndTypeAndSourceId(UUID momentId, UUID actorId,
                                                       com.lovenotes.server.domain.DomainEnums.MessageType type, UUID sourceId);
}
