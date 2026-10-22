package com.lovenotes.server.repository;
import com.lovenotes.server.domain.MediaAssetEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
import java.time.Instant;
public interface MediaAssetRepository extends JpaRepository<MediaAssetEntity, UUID> {
    String SHARED_ALBUM_SOURCE = "a.status=com.lovenotes.server.domain.DomainEnums$MediaStatus.READY and exists (select m.id from MomentEntity m where m.id=a.momentId and m.adminHidden=false and m.coupleId=:couple and m.visibility=com.lovenotes.server.domain.DomainEnums$Visibility.SHARED and m.status=com.lovenotes.server.domain.DomainEnums$MomentStatus.PUBLISHED and m.type=com.lovenotes.server.domain.DomainEnums$MomentType.IMAGE) and not exists (select d.id from DerivedAssetEntity d where d.renderedMediaAssetId=a.id)";
    @org.springframework.data.jpa.repository.Query("select count(a) from MediaAssetEntity a where a.kind=com.lovenotes.server.domain.DomainEnums$MediaKind.IMAGE and ((a.albumCoupleId=:couple and a.status in (com.lovenotes.server.domain.DomainEnums$MediaStatus.READY,com.lovenotes.server.domain.DomainEnums$MediaStatus.PROCESSING)) or ("+SHARED_ALBUM_SOURCE+"))")
    long countAlbumSlots(@org.springframework.data.repository.query.Param("couple") UUID couple);
    @org.springframework.data.jpa.repository.Query("select a from MediaAssetEntity a where a.id in :ids and a.kind=com.lovenotes.server.domain.DomainEnums$MediaKind.IMAGE and ((a.albumCoupleId=:couple and a.status=com.lovenotes.server.domain.DomainEnums$MediaStatus.READY) or ("+SHARED_ALBUM_SOURCE+"))")
    List<MediaAssetEntity> findSortableAlbumPhotos(@org.springframework.data.repository.query.Param("couple") UUID couple,
                                                @org.springframework.data.repository.query.Param("ids") Collection<UUID> ids);
    @org.springframework.data.jpa.repository.Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @org.springframework.data.jpa.repository.Query("select asset from MediaAssetEntity asset where asset.id = :id")
    Optional<MediaAssetEntity> findLockedById(@org.springframework.data.repository.query.Param("id") UUID id);
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
