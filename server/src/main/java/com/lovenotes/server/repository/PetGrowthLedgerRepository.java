package com.lovenotes.server.repository;

import com.lovenotes.server.domain.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;

import java.time.*;
import java.util.*;

public interface PetGrowthLedgerRepository extends JpaRepository<PetGrowthLedgerEntity, UUID> {
    Optional<PetGrowthLedgerEntity> findByPetIdAndSourceTypeAndSourceIdAndRuleVersion(
            UUID petId, DomainEnums.PetGrowthSource sourceType, UUID sourceId, int ruleVersion);
    List<PetGrowthLedgerEntity> findByPetIdAndSourceId(UUID petId, UUID sourceId);

    @Query("select coalesce(sum(l.delta),0) from PetGrowthLedgerEntity l where l.coupleId=:coupleId and l.actionDate=:date and l.reversedAt is null")
    long activeGrowthForDate(@Param("coupleId") UUID coupleId, @Param("date") LocalDate date);

    List<PetGrowthLedgerEntity> findByPetIdAndReversedAtIsNullAndCreatedAtAfterOrderByCreatedAtDesc(
            UUID petId, Instant createdAfter, Pageable pageable);
    long deleteByCreatedAtBefore(Instant cutoff);
}
