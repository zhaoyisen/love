package com.lovenotes.server.repository;

import com.lovenotes.server.domain.MomentCommentEntity;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface MomentCommentRepository extends JpaRepository<MomentCommentEntity, UUID> {
    List<MomentCommentEntity> findByMomentIdOrderByCreatedAtAsc(UUID momentId);
    List<MomentCommentEntity> findByAuthorIdOrderByCreatedAtAsc(UUID authorId);
}
