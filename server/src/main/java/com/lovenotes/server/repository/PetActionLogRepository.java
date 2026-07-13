package com.lovenotes.server.repository;

import com.lovenotes.server.domain.*;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.time.LocalDate;
import java.util.*;

public interface PetActionLogRepository extends JpaRepository<PetActionLogEntity, UUID> {
    boolean existsByCoupleIdAndActorIdAndActionTypeAndActionDate(UUID coupleId, UUID actorId, DomainEnums.PetAction actionType, LocalDate actionDate);
    List<PetActionLogEntity> findByPetIdOrderByCreatedAtDesc(UUID petId, Pageable pageable);
}
