package com.lovenotes.server.media;

import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.MomentRepository;
import com.lovenotes.server.storage.ObjectStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Set;

@Service
public class MediaCleanupService {
    private static final Set<DomainEnums.MediaStatus> ORPHAN_STATUSES = Set.of(
            DomainEnums.MediaStatus.CREATED,
            DomainEnums.MediaStatus.UPLOADED,
            DomainEnums.MediaStatus.PROCESSING,
            DomainEnums.MediaStatus.READY,
            DomainEnums.MediaStatus.BLOCKED,
            DomainEnums.MediaStatus.FAILED);

    private final MediaAssetRepository assets;
    private final MomentRepository moments;
    private final ObjectStorage storage;
    private final LoveNotesProperties properties;

    public MediaCleanupService(MediaAssetRepository assets, MomentRepository moments,
                               ObjectStorage storage, LoveNotesProperties properties) {
        this.assets = assets;
        this.moments = moments;
        this.storage = storage;
        this.properties = properties;
    }

    @Transactional
    public CleanupResult runBatch() {
        Instant now = Instant.now();
        int purgedMoments = 0;
        int deletedAssets = 0;
        var expiredTrash = moments.findTop100ByStatusAndDeletedAtBeforeOrderByDeletedAtAsc(
                DomainEnums.MomentStatus.TRASHED,
                now.minus(properties.media().trashRetentionDays(), ChronoUnit.DAYS));
        for (var moment : expiredTrash) {
            List<MediaAssetEntity> momentAssets = assets.findByMomentIdOrderByCreatedAtAsc(moment.getId());
            for (MediaAssetEntity asset : momentAssets) {
                delete(asset);
                deletedAssets++;
            }
            moment.purge();
            purgedMoments++;
        }

        var orphans = assets.findTop100ByMomentIdIsNullAndStatusInAndCreatedAtBeforeOrderByCreatedAtAsc(
                ORPHAN_STATUSES,
                now.minus(properties.media().orphanRetentionHours(), ChronoUnit.HOURS));
        for (MediaAssetEntity orphan : orphans) {
            delete(orphan);
            deletedAssets++;
        }
        return new CleanupResult(purgedMoments, deletedAssets);
    }

    private void delete(MediaAssetEntity asset) {
        storage.deleteObjects(asset.objectKeys());
        asset.markDeleted();
    }

    public record CleanupResult(int purgedMoments, int deletedAssets) {}
}
