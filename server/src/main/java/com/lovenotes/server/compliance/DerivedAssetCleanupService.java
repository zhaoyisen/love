package com.lovenotes.server.compliance;

import com.lovenotes.server.domain.DerivedAssetEntity;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.repository.DerivedAssetRepository;
import com.lovenotes.server.storage.ObjectStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class DerivedAssetCleanupService {
    private final DerivedAssetRepository derivedAssets;
    private final ObjectStorage storage;

    public DerivedAssetCleanupService(DerivedAssetRepository derivedAssets, ObjectStorage storage) {
        this.derivedAssets = derivedAssets;
        this.storage = storage;
    }

    @Transactional
    public int deleteForOwner(UUID ownerId) {
        int deleted = 0;
        for (DerivedAssetEntity asset : derivedAssets.findByOwnerIdAndStatusNotOrderByCreatedAtAsc(
                ownerId, DomainEnums.DerivedAssetStatus.DELETED)) {
            storage.deleteObjects(List.of(asset.getStorageKey()));
            asset.markDeleted();
            deleted++;
        }
        return deleted;
    }

    @Transactional
    public int deleteForSource(String sourceType, UUID sourceId) {
        int deleted = 0;
        String normalized = sourceType == null ? "UNKNOWN" : sourceType.trim().replaceAll("\\s+", "_").toUpperCase();
        for (DerivedAssetEntity asset : derivedAssets.findBySourceTypeAndSourceIdAndStatusNotOrderByCreatedAtAsc(
                normalized, sourceId, DomainEnums.DerivedAssetStatus.DELETED)) {
            storage.deleteObjects(List.of(asset.getStorageKey()));
            asset.markDeleted();
            deleted++;
        }
        return deleted;
    }
}
