package com.lovenotes.server.repository;

import com.lovenotes.server.domain.DerivedAssetEntity;
import com.lovenotes.server.domain.DomainEnums;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.UUID;

public interface DerivedAssetRepository extends JpaRepository<DerivedAssetEntity, UUID> {
    List<DerivedAssetEntity> findByOwnerIdAndStatusNotOrderByCreatedAtAsc(
            UUID ownerId, DomainEnums.DerivedAssetStatus status);

    List<DerivedAssetEntity> findBySourceTypeAndSourceIdAndStatusNotOrderByCreatedAtAsc(
            String sourceType, UUID sourceId, DomainEnums.DerivedAssetStatus status);
}
