package com.lovenotes.server.repository;

import com.lovenotes.server.domain.ContentFeedbackEntity;
import com.lovenotes.server.domain.DomainEnums;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.*;

public interface ContentFeedbackRepository extends JpaRepository<ContentFeedbackEntity, UUID> {
    List<ContentFeedbackEntity> findByReporterIdOrderByCreatedAtDesc(UUID reporterId, Pageable pageable);
    List<ContentFeedbackEntity> findByStatusOrderByCreatedAtAsc(DomainEnums.FeedbackStatus status, Pageable pageable);
    List<ContentFeedbackEntity> findByStatusInOrderByCreatedAtAsc(Collection<DomainEnums.FeedbackStatus> statuses, Pageable pageable);
}
