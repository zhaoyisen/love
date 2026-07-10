package com.lovenotes.server.repository;

import com.lovenotes.server.domain.AuditLogEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface AuditLogRepository extends JpaRepository<AuditLogEntity, UUID> {
    List<AuditLogEntity> findByActorIdOrderByCreatedAtDesc(UUID actorId);
    long countByAction(String action);
}
