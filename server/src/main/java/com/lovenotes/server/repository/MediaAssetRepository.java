package com.lovenotes.server.repository;
import com.lovenotes.server.domain.MediaAssetEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
import java.time.Instant;
public interface MediaAssetRepository extends JpaRepository<MediaAssetEntity, UUID> {
    List<MediaAssetEntity> findByIdIn(Collection<UUID> ids);
    List<MediaAssetEntity> findByMomentIdOrderByCreatedAtAsc(UUID momentId);
    List<MediaAssetEntity> findTop20ByStatusOrderByUpdatedAtAsc(com.lovenotes.server.domain.DomainEnums.MediaStatus status);
    List<MediaAssetEntity> findTop100ByMomentIdIsNullAndStatusInAndCreatedAtBeforeOrderByCreatedAtAsc(
            Collection<com.lovenotes.server.domain.DomainEnums.MediaStatus> statuses, Instant createdBefore);
}
