package com.lovenotes.server.media;

import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.domain.MomentEntity;
import com.lovenotes.server.message.MessageService;
import com.lovenotes.server.pet.PetGrowthService;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.DerivedAssetRepository;
import com.lovenotes.server.repository.MomentRepository;
import com.lovenotes.server.storage.ObjectStorage;
import org.junit.jupiter.api.Test;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.verify;
import static org.mockito.ArgumentMatchers.*;

class MediaProcessingServiceTest {
    @Test
    void shouldBackfillAnExistingReadyVideoWithoutRepublishingOrAuditingAgain() {
        MediaAssetRepository assets = mock(MediaAssetRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        MessageService messages = mock(MessageService.class);
        PetGrowthService petGrowth = mock(PetGrowthService.class);
        MomentRepository moments = mock(MomentRepository.class);
        MediaProcessingService service = new MediaProcessingService(assets, mock(DerivedAssetRepository.class), moments, storage, messages, petGrowth);
        MediaAssetEntity asset = new MediaAssetEntity(UUID.randomUUID(), DomainEnums.MediaKind.VIDEO, "original/video.mp4", null, "video/mp4", 100);
        asset.markReady("original/video.mp4", null);
        when(assets.findById(asset.getId())).thenReturn(Optional.of(asset));
        when(storage.createDerivatives(DomainEnums.MediaKind.VIDEO, "original/video.mp4"))
                .thenReturn(new ObjectStorage.Derivatives("original/video.mp4", "thumbnail/video.jpg"));
        when(assets.findTop5ByStatusAndThumbnailStorageKeyIsNullAndUpdatedAtBeforeOrderByUpdatedAtAsc(eq(DomainEnums.MediaStatus.READY), any(Instant.class)))
                .thenReturn(List.of(asset));
        assertEquals(List.of(asset.getId()), service.missingThumbnailIds());
        service.backfillThumbnail(asset.getId());
        assertEquals("thumbnail/video.jpg", asset.getThumbnailStorageKey());
        assertEquals(DomainEnums.MediaStatus.READY, asset.getStatus());
        verifyNoInteractions(messages, petGrowth, moments);
        verify(storage).createDerivatives(DomainEnums.MediaKind.VIDEO, "original/video.mp4");
    }

    @Test
    void shouldSkipBlockedMediaAndRetryCoverFailuresWithoutChangingReadyStatus() {
        MediaAssetRepository assets = mock(MediaAssetRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        MediaProcessingService service = new MediaProcessingService(assets, mock(DerivedAssetRepository.class), mock(MomentRepository.class), storage, mock(MessageService.class), mock(PetGrowthService.class));
        MediaAssetEntity asset = new MediaAssetEntity(UUID.randomUUID(), DomainEnums.MediaKind.VIDEO, "original/video.mp4", null, "video/mp4", 100);
        asset.markBlocked();
        when(assets.findById(asset.getId())).thenReturn(Optional.of(asset));
        service.backfillThumbnail(asset.getId());
        verifyNoInteractions(storage);
        asset.markReady("original/video.mp4", null);
        when(storage.createDerivatives(DomainEnums.MediaKind.VIDEO, "original/video.mp4")).thenThrow(new IllegalStateException("try later"));
        service.backfillThumbnail(asset.getId());
        assertEquals(DomainEnums.MediaStatus.READY, asset.getStatus());
        assertEquals(null, asset.getThumbnailStorageKey());
    }
    @Test
    void shouldPublishMomentOnlyAfterAllMediaPassSafetyProcessing() {
        MediaAssetRepository assets = mock(MediaAssetRepository.class);
        DerivedAssetRepository derivedAssets = mock(DerivedAssetRepository.class);
        MomentRepository moments = mock(MomentRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        MessageService messages = mock(MessageService.class);
        PetGrowthService petGrowth = mock(PetGrowthService.class);
        MediaProcessingService service = new MediaProcessingService(assets, derivedAssets, moments, storage, messages, petGrowth);

        UUID userId = UUID.randomUUID();
        MomentEntity moment = new MomentEntity(userId, null, DomainEnums.MomentType.IMAGE,
                "照片", "正文", Instant.now(), DomainEnums.Visibility.PRIVATE, DomainEnums.MomentStatus.UPLOADING);
        MediaAssetEntity asset = new MediaAssetEntity(userId, DomainEnums.MediaKind.IMAGE,
                "original/test.jpg", null, "image/jpeg", 1024);
        asset.complete("etag", true);
        asset.attach(moment.getId());

        when(assets.findById(asset.getId())).thenReturn(Optional.of(asset));
        when(assets.findByMomentIdOrderByCreatedAtAsc(moment.getId())).thenReturn(List.of(asset));
        when(derivedAssets.findByRenderedMediaAssetId(asset.getId())).thenReturn(Optional.empty());
        when(derivedAssets.findByRenderedMediaAssetIdIn(List.of(asset.getId()))).thenReturn(List.of());
        when(moments.findById(moment.getId())).thenReturn(Optional.of(moment));
        when(storage.process(DomainEnums.MediaKind.IMAGE, "original/test.jpg", null))
                .thenReturn(new ObjectStorage.ProcessingResult(
                        ObjectStorage.ProcessingOutcome.READY,
                        "audit-job",
                        "display/test.webp",
                        "thumbnail/test.webp"));

        service.process(asset.getId());

        assertEquals(DomainEnums.MediaStatus.READY, asset.getStatus());
        assertEquals(DomainEnums.MomentStatus.PUBLISHED, moment.getStatus());
        assertEquals("audit-job", asset.getProcessingJobId());
        assertEquals("display/test.webp", asset.getDisplayStorageKey());
        assertEquals("thumbnail/test.webp", asset.getThumbnailStorageKey());
    }

    @Test
    void shouldKeepBlockedMediaOutOfPublishedTimeline() {
        MediaAssetRepository assets = mock(MediaAssetRepository.class);
        DerivedAssetRepository derivedAssets = mock(DerivedAssetRepository.class);
        MomentRepository moments = mock(MomentRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        MessageService messages = mock(MessageService.class);
        PetGrowthService petGrowth = mock(PetGrowthService.class);
        MediaProcessingService service = new MediaProcessingService(assets, derivedAssets, moments, storage, messages, petGrowth);

        UUID userId = UUID.randomUUID();
        MomentEntity moment = new MomentEntity(userId, null, DomainEnums.MomentType.VIDEO,
                "视频", "正文", Instant.now(), DomainEnums.Visibility.PRIVATE, DomainEnums.MomentStatus.UPLOADING);
        MediaAssetEntity asset = new MediaAssetEntity(userId, DomainEnums.MediaKind.VIDEO,
                "original/test.mp4", null, "video/mp4", 2048);
        asset.complete("etag", true);
        asset.attach(moment.getId());

        when(assets.findById(asset.getId())).thenReturn(Optional.of(asset));
        when(assets.findByMomentIdOrderByCreatedAtAsc(moment.getId())).thenReturn(List.of(asset));
        when(derivedAssets.findByRenderedMediaAssetId(asset.getId())).thenReturn(Optional.empty());
        when(derivedAssets.findByRenderedMediaAssetIdIn(List.of(asset.getId()))).thenReturn(List.of());
        when(moments.findById(moment.getId())).thenReturn(Optional.of(moment));
        when(storage.process(DomainEnums.MediaKind.VIDEO, "original/test.mp4", null))
                .thenReturn(new ObjectStorage.ProcessingResult(
                        ObjectStorage.ProcessingOutcome.BLOCKED, "video-job", null, null));

        service.process(asset.getId());

        assertEquals(DomainEnums.MediaStatus.BLOCKED, asset.getStatus());
        assertEquals(DomainEnums.MomentStatus.PARTIAL_FAILED, moment.getStatus());
    }
}
