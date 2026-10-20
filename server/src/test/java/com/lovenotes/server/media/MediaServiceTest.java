package com.lovenotes.server.media;

import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.repository.*;
import com.lovenotes.server.storage.ObjectStorage;
import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class MediaServiceTest {
    @Test
    void shouldDeleteAlbumOriginalAndDerivativesOnlyAfterAuthorizationAndPreserveFailures() {
        ObjectStorage storage=mock(ObjectStorage.class);
        MediaAssetRepository assets=mock(MediaAssetRepository.class);
        MediaService service=new MediaService(assets,mock(UploadSessionRepository.class),mock(MomentRepository.class),mock(ActiveCoupleMemberRepository.class),storage,null);
        UUID owner=UUID.randomUUID(),couple=UUID.randomUUID();
        MediaAssetEntity photo=new MediaAssetEntity(owner,DomainEnums.MediaKind.IMAGE,"original/photo.jpg",null,"image/jpeg",100);
        photo.attachToAlbum(couple);photo.markReady("display/photo.webp","thumbnail/photo.webp");
        when(assets.findLockedById(photo.getId())).thenReturn(java.util.Optional.of(photo));
        assertThrows(com.lovenotes.server.common.ApiException.class,()->service.deleteAlbumPhoto(UUID.randomUUID(),couple,photo.getId()));
        assertThrows(com.lovenotes.server.common.ApiException.class,()->service.deleteAlbumPhoto(owner,UUID.randomUUID(),photo.getId()));
        verifyNoInteractions(storage);
        doThrow(new IllegalStateException("storage unavailable")).when(storage).deleteObjects(photo.objectKeys());
        assertThrows(IllegalStateException.class,()->service.deleteAlbumPhoto(owner,couple,photo.getId()));
        assertEquals(DomainEnums.MediaStatus.READY,photo.getStatus());
        doNothing().when(storage).deleteObjects(photo.objectKeys());
        service.deleteAlbumPhoto(owner,couple,photo.getId());service.deleteAlbumPhoto(owner,couple,photo.getId());
        assertEquals(DomainEnums.MediaStatus.DELETED,photo.getStatus());
        verify(storage,times(2)).deleteObjects(java.util.List.of("original/photo.jpg","display/photo.webp","thumbnail/photo.webp"));
    }

    @Test
    void shouldKeepOriginalImageBytesAndMimeTypeSeparateFromWebpDerivatives() {
        ObjectStorage storage=mock(ObjectStorage.class);
        MediaService service=new MediaService(mock(MediaAssetRepository.class),mock(UploadSessionRepository.class),mock(MomentRepository.class),mock(ActiveCoupleMemberRepository.class),storage,null);
        UUID owner=UUID.randomUUID();
        MediaAssetEntity image=new MediaAssetEntity(owner,DomainEnums.MediaKind.IMAGE,"original/photo.png",null,"image/png",100);
        assertNull(service.originalUrlIfReady(owner,image));
        image.markReady("display/photo.webp","thumbnail/photo.webp");
        when(storage.signedGetUrl("original/photo.png",Duration.ofMinutes(15),"image/png")).thenReturn("https://cos/original/photo.png");
        assertEquals("https://cos/original/photo.png",service.originalUrlIfReady(owner,image));
        assertNull(service.originalUrlIfReady(UUID.randomUUID(),image));
        image.markBlocked();assertNull(service.originalUrlIfReady(owner,image));
        verify(storage).signedGetUrl("original/photo.png",Duration.ofMinutes(15),"image/png");verifyNoMoreInteractions(storage);
    }

    @Test
    void shouldOfferACoverForAuthorizedReadyVideoBeforeStoredThumbnailExists() {
        ObjectStorage storage = mock(ObjectStorage.class);
        MediaService service = new MediaService(mock(MediaAssetRepository.class), mock(UploadSessionRepository.class), mock(MomentRepository.class), mock(ActiveCoupleMemberRepository.class), storage, null);
        UUID owner = UUID.randomUUID();
        when(storage.signedVideoSnapshotUrl("original/video.mp4", Duration.ofMinutes(15))).thenReturn("https://cos/video.mp4?ci-process=snapshot&signature=test");
        MediaAssetEntity video = new MediaAssetEntity(owner, DomainEnums.MediaKind.VIDEO, "original/video.mp4", null, "video/mp4", 100);
        video.markReady("original/video.mp4", null);
        assertEquals("https://cos/video.mp4?ci-process=snapshot&signature=test", service.thumbnailUrlIfReady(owner, video));
        assertNull(service.thumbnailUrlIfReady(UUID.randomUUID(), video));
        video.markBlocked();
        assertNull(service.thumbnailUrlIfReady(owner, video));
        MediaAssetEntity image = new MediaAssetEntity(owner, DomainEnums.MediaKind.IMAGE, "original/missing.jpg", null, "image/jpeg", 100);
        image.markReady("original/missing.jpg", null);
        assertNull(service.thumbnailUrlIfReady(owner, image));
        verify(storage).signedVideoSnapshotUrl("original/video.mp4", Duration.ofMinutes(15));
        verifyNoMoreInteractions(storage);
    }

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
