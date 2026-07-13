package com.lovenotes.server.repository;

import com.lovenotes.server.domain.AnnualRecapEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface AnnualRecapRepository extends JpaRepository<AnnualRecapEntity, UUID> {
    Optional<AnnualRecapEntity> findByCoupleIdAndYear(UUID coupleId, int year);
}
