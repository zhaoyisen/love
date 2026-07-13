package com.lovenotes.server.repository;

import com.lovenotes.server.domain.PetStateEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface PetStateRepository extends JpaRepository<PetStateEntity, UUID> {
    Optional<PetStateEntity> findByCoupleId(UUID coupleId);
}
