package com.lovenotes.server.repository;
import com.lovenotes.server.domain.MediaAssetEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import java.util.*;
public interface MediaAssetRepository extends JpaRepository<MediaAssetEntity, UUID> { List<MediaAssetEntity> findByIdIn(Collection<UUID> ids); }
