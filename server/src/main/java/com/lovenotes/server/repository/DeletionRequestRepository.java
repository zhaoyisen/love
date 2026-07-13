package com.lovenotes.server.repository;

import com.lovenotes.server.domain.DeletionRequestEntity;
import com.lovenotes.server.domain.DomainEnums;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface DeletionRequestRepository extends JpaRepository<DeletionRequestEntity, UUID> {
    Optional<DeletionRequestEntity> findFirstByRequesterIdOrderByRequestedAtDesc(UUID requesterId);
    List<DeletionRequestEntity> findTop20ByStatusOrderByRequestedAtAsc(DomainEnums.DeletionRequestStatus status);
}
