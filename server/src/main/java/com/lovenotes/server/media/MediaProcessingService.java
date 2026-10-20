package com.lovenotes.server.media;

import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.DerivedAssetEntity;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.domain.MomentEntity;
import com.lovenotes.server.message.MessageService;
import com.lovenotes.server.pet.PetGrowthService;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.DerivedAssetRepository;
import com.lovenotes.server.repository.MomentRepository;
import com.lovenotes.server.storage.ObjectStorage;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;
import java.time.Instant;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

@Service
public class MediaProcessingService {
    private static final Logger log = LoggerFactory.getLogger(MediaProcessingService.class);
    private final MediaAssetRepository assets;
    private final DerivedAssetRepository derivedAssets;
    private final MomentRepository moments;
    private final ObjectStorage storage;
    private final MessageService messages;
    private final PetGrowthService petGrowth;

    public MediaProcessingService(MediaAssetRepository assets, DerivedAssetRepository derivedAssets, MomentRepository moments, ObjectStorage storage, MessageService messages, PetGrowthService petGrowth) {
        this.assets = assets;
        this.derivedAssets = derivedAssets;
        this.moments = moments;
        this.storage = storage;
        this.messages = messages;
        this.petGrowth = petGrowth;
    }

    @Transactional(readOnly = true)
    public List<UUID> pendingIds() {
        return assets.findTop20ByStatusOrderByUpdatedAtAsc(DomainEnums.MediaStatus.PROCESSING)
                .stream().map(MediaAssetEntity::getId).toList();
    }

    @Transactional(readOnly = true)
    public List<UUID> missingThumbnailIds() {
        return assets.findTop5ByStatusAndThumbnailStorageKeyIsNullAndUpdatedAtBeforeOrderByUpdatedAtAsc(
                DomainEnums.MediaStatus.READY, Instant.now().minusSeconds(60))
                .stream().map(MediaAssetEntity::getId).toList();
    }

    @Transactional
    public void backfillThumbnail(UUID assetId) {
        // 与相册删除共用行锁，避免删除后又生成未清理的缩略图。
        MediaAssetEntity asset = assets.findLockedById(assetId).orElse(null);
        if (asset == null || asset.getStatus() != DomainEnums.MediaStatus.READY || asset.getThumbnailStorageKey() != null) return;
        // 即使截帧失败也推进重试时间，避免坏文件长期占据补图队列。
        asset.updateDerivatives(asset.getDisplayStorageKey(), null);
        try {
            ObjectStorage.Derivatives result = storage.createDerivatives(asset.getKind(), asset.getStorageKey());
            asset.updateDerivatives(result.displayKey(), result.thumbnailKey());
        } catch (Exception exception) {
            log.warn("Media thumbnail will retry, asset_id={}, reason={}", assetId, exception.getClass().getSimpleName());
        }
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
        derivedAssets.findByRenderedMediaAssetId(asset.getId()).ifPresent(render -> {
            if (result.outcome() == ObjectStorage.ProcessingOutcome.READY) render.markReady();
            else render.markFailed(result.outcome().name());
        });
        updateMoment(asset);
    }

    private void updateMoment(MediaAssetEntity changed) {
        if (changed.getMomentId() == null) return;
        MomentEntity moment = moments.findById(changed.getMomentId()).orElse(null);
        if (moment == null) return;
        List<MediaAssetEntity> momentAssets = assets.findByMomentIdOrderByCreatedAtAsc(moment.getId());
        var renderedIds = derivedAssets.findByRenderedMediaAssetIdIn(momentAssets.stream().map(MediaAssetEntity::getId).toList())
                .stream().map(DerivedAssetEntity::getRenderedMediaAssetId).collect(java.util.stream.Collectors.toSet());
        List<MediaAssetEntity> sourceAssets = momentAssets.stream().filter(asset -> !renderedIds.contains(asset.getId())).toList();
        if (sourceAssets.stream().anyMatch(asset -> asset.getStatus() == DomainEnums.MediaStatus.BLOCKED
                || asset.getStatus() == DomainEnums.MediaStatus.FAILED)) {
            moment.mediaFailed();
        } else if (!sourceAssets.isEmpty() && sourceAssets.stream()
                .allMatch(asset -> asset.getStatus() == DomainEnums.MediaStatus.READY)) {
            boolean justPublished = moment.getStatus() != DomainEnums.MomentStatus.PUBLISHED;
            moment.publish();
            if (justPublished) {
                messages.notifySharedMoment(moment);
                petGrowth.rewardMoment(moment);
            }
        }
    }
}
