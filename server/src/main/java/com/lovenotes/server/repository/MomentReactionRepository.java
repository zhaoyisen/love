package com.lovenotes.server.repository;

import com.lovenotes.server.domain.MomentReactionEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface MomentReactionRepository extends JpaRepository<MomentReactionEntity, UUID> {
    Optional<MomentReactionEntity> findByMomentIdAndActorId(UUID momentId, UUID actorId);
    List<MomentReactionEntity> findByMomentIdOrderByUpdatedAtAsc(UUID momentId);
    List<MomentReactionEntity> findByActorIdOrderByUpdatedAtAsc(UUID actorId);
}
