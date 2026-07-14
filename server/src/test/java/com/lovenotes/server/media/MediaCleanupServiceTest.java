package com.lovenotes.server.media;

import com.lovenotes.server.config.LoveNotesProperties;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.domain.MomentEntity;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.MomentRepository;
import com.lovenotes.server.storage.ObjectStorage;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyCollection;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class MediaCleanupServiceTest {
    @Test
    void shouldDeleteAllObjectVariantsBeforePurgingTrashedMoment() {
        MediaAssetRepository assets = mock(MediaAssetRepository.class);
        MomentRepository moments = mock(MomentRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        LoveNotesProperties properties = properties();
        MediaCleanupService service = new MediaCleanupService(assets, moments, storage, properties);

        UUID userId = UUID.randomUUID();
        MomentEntity moment = new MomentEntity(userId, null, DomainEnums.MomentType.IMAGE,
                "photo", "body", Instant.now(), DomainEnums.Visibility.PRIVATE, DomainEnums.MomentStatus.PUBLISHED);
        moment.trash();
        MediaAssetEntity asset = new MediaAssetEntity(userId, DomainEnums.MediaKind.IMAGE,
                "original/test.jpg", null, "image/jpeg", 1024);
        asset.complete("etag", true);
        asset.markReady("display/test.webp", "thumbnail/test.webp");
        asset.attach(moment.getId());

        when(moments.findTop100ByStatusAndDeletedAtBeforeOrderByDeletedAtAsc(
                any(DomainEnums.MomentStatus.class), any(Instant.class))).thenReturn(List.of(moment));
        when(assets.findByMomentIdOrderByCreatedAtAsc(moment.getId())).thenReturn(List.of(asset));
        when(assets.findTop100ByMomentIdIsNullAndProfileAvatarFalseAndStatusInAndCreatedAtBeforeOrderByCreatedAtAsc(
                anyCollection(), any(Instant.class))).thenReturn(List.of());

        service.runBatch();

        verify(storage).deleteObjects(List.of(
                "original/test.jpg", "display/test.webp", "thumbnail/test.webp"));
        assertEquals(DomainEnums.MediaStatus.DELETED, asset.getStatus());
        assertEquals(DomainEnums.MomentStatus.PURGED, moment.getStatus());
    }

    @Test
    void shouldDeleteUnattachedExpiredUpload() {
        MediaAssetRepository assets = mock(MediaAssetRepository.class);
        MomentRepository moments = mock(MomentRepository.class);
        ObjectStorage storage = mock(ObjectStorage.class);
        MediaCleanupService service = new MediaCleanupService(assets, moments, storage, properties());
        MediaAssetEntity orphan = new MediaAssetEntity(UUID.randomUUID(), DomainEnums.MediaKind.VIDEO,
                "original/orphan.mp4", null, "video/mp4", 2048);

        when(moments.findTop100ByStatusAndDeletedAtBeforeOrderByDeletedAtAsc(
                any(DomainEnums.MomentStatus.class), any(Instant.class))).thenReturn(List.of());
        when(assets.findTop100ByMomentIdIsNullAndProfileAvatarFalseAndStatusInAndCreatedAtBeforeOrderByCreatedAtAsc(
                anyCollection(), any(Instant.class))).thenReturn(List.of(orphan));

        service.runBatch();

        verify(storage).deleteObjects(List.of("original/orphan.mp4"));
        assertEquals(DomainEnums.MediaStatus.DELETED, orphan.getStatus());
    }

    private LoveNotesProperties properties() {
        return new LoveNotesProperties(
                new LoveNotesProperties.Session(Duration.ofMinutes(30), Duration.ofDays(30)),
                new LoveNotesProperties.Invitation(Duration.ofDays(1)),
                new LoveNotesProperties.Media(20, 200, 1800, 30, 24),
                new LoveNotesProperties.Timeline("test-secret"),
                new LoveNotesProperties.Wechat("", "", ""),
                new LoveNotesProperties.Storage("local", "bucket", "local", "", ""),
                new LoveNotesProperties.Operations(""));
    }
}
