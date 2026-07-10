package com.lovenotes.server.repository;

import com.lovenotes.server.domain.PetAdoptionProposalEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.Optional;
import java.util.UUID;

public interface PetAdoptionProposalRepository extends JpaRepository<PetAdoptionProposalEntity, UUID> {
    Optional<PetAdoptionProposalEntity> findByCoupleId(UUID coupleId);
}
