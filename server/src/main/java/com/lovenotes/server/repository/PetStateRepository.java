package com.lovenotes.server.repository;

import com.lovenotes.server.domain.PetStateEntity;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;

import java.util.*;

public interface PetStateRepository extends JpaRepository<PetStateEntity, UUID> {
    Optional<PetStateEntity> findByCoupleId(UUID coupleId);
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("select p from PetStateEntity p where p.coupleId=:coupleId")
    Optional<PetStateEntity> findByCoupleIdLocked(@Param("coupleId") UUID coupleId);
}
