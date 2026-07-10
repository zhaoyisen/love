package com.lovenotes.server.media;

import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.domain.MomentEntity;
import com.lovenotes.server.message.MessageService;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.MomentRepository;
import com.lovenotes.server.storage.ObjectStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
public class MediaProcessingService {
    private final MediaAssetRepository assets;
    private final MomentRepository moments;
    private final ObjectStorage storage;
    private final MessageService messages;

    public MediaProcessingService(MediaAssetRepository assets, MomentRepository moments, ObjectStorage storage, MessageService messages) {
        this.assets = assets;
        this.moments = moments;
        this.storage = storage;
        this.messages = messages;
    }

    @Transactional(readOnly = true)
    public List<UUID> pendingIds() {
        return assets.findTop20ByStatusOrderByUpdatedAtAsc(DomainEnums.MediaStatus.PROCESSING)
                .stream().map(MediaAssetEntity::getId).toList();
    }

    @Transactional
    public void process(UUID assetId) {
        MediaAssetEntity asset = assets.findById(assetId).orElse(null);
        if (asset == null || asset.getStatus() != DomainEnums.MediaStatus.PROCESSING) return;
        ObjectStorage.ProcessingResult result = storage.process(
                asset.getKind(), asset.getStorageKey(), asset.getProcessingJobId());
        asset.processingJob(result.jobId());
        switch (result.outcome()) {
            case READY -> asset.markReady(result.displayKey(), result.thumbnailKey());
            case BLOCKED -> asset.markBlocked();
            case FAILED -> asset.markFailed();
            case PENDING -> { return; }
        }
        updateMoment(asset);
    }

    private void updateMoment(MediaAssetEntity changed) {
        if (changed.getMomentId() == null) return;
        MomentEntity moment = moments.findById(changed.getMomentId()).orElse(null);
        if (moment == null) return;
        List<MediaAssetEntity> momentAssets = assets.findByMomentIdOrderByCreatedAtAsc(moment.getId());
        if (momentAssets.stream().anyMatch(asset -> asset.getStatus() == DomainEnums.MediaStatus.BLOCKED
                || asset.getStatus() == DomainEnums.MediaStatus.FAILED)) {
            moment.mediaFailed();
        } else if (!momentAssets.isEmpty() && momentAssets.stream()
                .allMatch(asset -> asset.getStatus() == DomainEnums.MediaStatus.READY)) {
            boolean justPublished = moment.getStatus() != DomainEnums.MomentStatus.PUBLISHED;
            moment.publish();
            if (justPublished) messages.notifySharedMoment(moment);
        }
    }
}
