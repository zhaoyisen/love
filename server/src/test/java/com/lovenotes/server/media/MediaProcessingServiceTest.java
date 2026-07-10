package com.lovenotes.server.media;

import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.domain.MomentEntity;
import com.lovenotes.server.message.MessageService;
import com.lovenotes.server.repository.MediaAssetRepository;
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

class MediaProcessingServiceTest {
    @Test
    void shouldPublishMomentOnlyAfterAllMediaPassSafetyProcessing() {
        MediaAssetRepository assets = mock(MediaAssetRepository.class);
        MomentRepository moments = mock(MomentRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        MessageService messages = mock(MessageService.class);
        MediaProcessingService service = new MediaProcessingService(assets, moments, storage, messages);

        UUID userId = UUID.randomUUID();
        MomentEntity moment = new MomentEntity(userId, null, DomainEnums.MomentType.IMAGE,
                "照片", "正文", Instant.now(), DomainEnums.Visibility.PRIVATE, DomainEnums.MomentStatus.UPLOADING);
        MediaAssetEntity asset = new MediaAssetEntity(userId, DomainEnums.MediaKind.IMAGE,
                "original/test.jpg", null, "image/jpeg", 1024);
        asset.complete("etag", true);
        asset.attach(moment.getId());

        when(assets.findById(asset.getId())).thenReturn(Optional.of(asset));
        when(assets.findByMomentIdOrderByCreatedAtAsc(moment.getId())).thenReturn(List.of(asset));
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
        MomentRepository moments = mock(MomentRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        MessageService messages = mock(MessageService.class);
        MediaProcessingService service = new MediaProcessingService(assets, moments, storage, messages);

        UUID userId = UUID.randomUUID();
        MomentEntity moment = new MomentEntity(userId, null, DomainEnums.MomentType.VIDEO,
                "视频", "正文", Instant.now(), DomainEnums.Visibility.PRIVATE, DomainEnums.MomentStatus.UPLOADING);
        MediaAssetEntity asset = new MediaAssetEntity(userId, DomainEnums.MediaKind.VIDEO,
                "original/test.mp4", null, "video/mp4", 2048);
        asset.complete("etag", true);
        asset.attach(moment.getId());

        when(assets.findById(asset.getId())).thenReturn(Optional.of(asset));
        when(assets.findByMomentIdOrderByCreatedAtAsc(moment.getId())).thenReturn(List.of(asset));
        when(moments.findById(moment.getId())).thenReturn(Optional.of(moment));
        when(storage.process(DomainEnums.MediaKind.VIDEO, "original/test.mp4", null))
                .thenReturn(new ObjectStorage.ProcessingResult(
                        ObjectStorage.ProcessingOutcome.BLOCKED, "video-job", null, null));

        service.process(asset.getId());

        assertEquals(DomainEnums.MediaStatus.BLOCKED, asset.getStatus());
        assertEquals(DomainEnums.MomentStatus.PARTIAL_FAILED, moment.getStatus());
    }
}
