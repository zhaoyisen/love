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
}
