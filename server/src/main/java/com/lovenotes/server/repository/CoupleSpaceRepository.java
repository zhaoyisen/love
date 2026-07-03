package com.lovenotes.server.repository;
import com.lovenotes.server.domain.CoupleSpaceEntity;
import org.springframework.data.jpa.repository.*;
import org.springframework.data.repository.query.Param;
import jakarta.persistence.LockModeType;
import java.util.*;
public interface CoupleSpaceRepository extends JpaRepository<CoupleSpaceEntity, UUID> {
    @Lock(LockModeType.PESSIMISTIC_WRITE) @Query("select c from CoupleSpaceEntity c where c.id=:id") Optional<CoupleSpaceEntity> findLocked(@Param("id") UUID id);
}
