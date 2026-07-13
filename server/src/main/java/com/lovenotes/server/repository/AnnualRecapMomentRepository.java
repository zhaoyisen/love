package com.lovenotes.server.repository;

import com.lovenotes.server.domain.AnnualRecapMomentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface AnnualRecapMomentRepository extends JpaRepository<AnnualRecapMomentEntity, UUID> {
    List<AnnualRecapMomentEntity> findByRecapIdOrderBySortOrderAsc(UUID recapId);
    void deleteByRecapId(UUID recapId);
}
