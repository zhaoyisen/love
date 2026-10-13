package com.lovenotes.server.repository;

import com.lovenotes.server.domain.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.time.Instant;
import java.util.*;

public interface PetActionLogRepository extends JpaRepository<PetActionLogEntity, UUID> {
    boolean existsByCoupleIdAndActorIdAndActionTypeAndActionDate(UUID coupleId, UUID actorId, DomainEnums.PetAction actionType, LocalDate actionDate);
    List<PetActionLogEntity> findByPetIdOrderByCreatedAtDesc(UUID petId, Pageable pageable);
    List<PetActionLogEntity> findByPetIdAndCreatedAtAfterOrderByCreatedAtDesc(UUID petId, Instant cutoff, Pageable pageable);
    @Query("select count(distinct l.actorId) from PetActionLogEntity l where l.coupleId=:coupleId and l.actionDate=:date")
    long countDistinctActorsForDate(@Param("coupleId") UUID coupleId, @Param("date") LocalDate date);
    long deleteByCreatedAtBefore(Instant cutoff);
}
