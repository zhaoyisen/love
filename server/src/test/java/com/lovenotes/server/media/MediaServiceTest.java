package com.lovenotes.server.media;

import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.repository.*;
import com.lovenotes.server.storage.ObjectStorage;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.*;

class MediaServiceTest {
    @Test
    void shouldSignTheSmallImageAndJpegVideoCoverWithTheirActualContentTypes() {
        ObjectStorage storage = mock(ObjectStorage.class);
        MediaService service = new MediaService(mock(MediaAssetRepository.class), mock(UploadSessionRepository.class), mock(MomentRepository.class), mock(ActiveCoupleMemberRepository.class), storage, null);
        UUID owner = UUID.randomUUID();
        MediaAssetEntity image = new MediaAssetEntity(owner, DomainEnums.MediaKind.IMAGE, "original/photo.jpg", null, "image/jpeg", 100);
        image.markReady("display/photo.webp", "thumbnail/photo.webp");
        service.accessUrlIfReady(owner, image);
        verify(storage).signedGetUrl("display/photo.webp", Duration.ofMinutes(15), "image/webp");
        MediaAssetEntity video = new MediaAssetEntity(owner, DomainEnums.MediaKind.VIDEO, "original/video.mp4", null, "video/mp4", 100);
        video.markReady("original/video.mp4", "thumbnail/video.jpg");
        service.thumbnailUrlIfReady(owner, video);
        verify(storage).signedGetUrl("thumbnail/video.jpg", Duration.ofMinutes(15), "image/jpeg");
        assertNull(service.thumbnailUrlIfReady(UUID.randomUUID(), video));
        video.markBlocked();
        assertNull(service.thumbnailUrlIfReady(owner, video));
        verifyNoMoreInteractions(storage);
    }
}
