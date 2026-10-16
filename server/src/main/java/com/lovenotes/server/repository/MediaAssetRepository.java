package com.lovenotes.server.repository;
import com.lovenotes.server.domain.MediaAssetEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
import java.time.Instant;
public interface MediaAssetRepository extends JpaRepository<MediaAssetEntity, UUID> {
    List<MediaAssetEntity> findByIdIn(Collection<UUID> ids);
    // shortcut: album preview returns the latest 100 photos; add cursor paging when browsing larger albums.
    List<MediaAssetEntity> findTop100ByAlbumCoupleIdAndStatusNotOrderByCreatedAtDesc(
            UUID coupleId, com.lovenotes.server.domain.DomainEnums.MediaStatus status);
    List<MediaAssetEntity> findByMomentIdOrderByCreatedAtAsc(UUID momentId);
    List<MediaAssetEntity> findByMomentIdInOrderByCreatedAtAsc(Collection<UUID> momentIds);
    List<MediaAssetEntity> findByUploaderIdAndStatusNotOrderByCreatedAtAsc(
            UUID uploaderId, com.lovenotes.server.domain.DomainEnums.MediaStatus status);
    List<MediaAssetEntity> findTop20ByStatusOrderByUpdatedAtAsc(com.lovenotes.server.domain.DomainEnums.MediaStatus status);
    List<MediaAssetEntity> findTop5ByStatusAndThumbnailStorageKeyIsNullAndUpdatedAtBeforeOrderByUpdatedAtAsc(
            com.lovenotes.server.domain.DomainEnums.MediaStatus status, Instant updatedBefore);
    List<MediaAssetEntity> findTop100ByMomentIdIsNullAndAlbumCoupleIdIsNullAndProfileAvatarFalseAndStatusInAndCreatedAtBeforeOrderByCreatedAtAsc(
            Collection<com.lovenotes.server.domain.DomainEnums.MediaStatus> statuses, Instant createdBefore);
    List<MediaAssetEntity> findTop100ByAlbumCoupleIdIsNotNullAndStatusInAndCreatedAtBeforeOrderByCreatedAtAsc(
            Collection<com.lovenotes.server.domain.DomainEnums.MediaStatus> statuses, Instant createdBefore);
}
