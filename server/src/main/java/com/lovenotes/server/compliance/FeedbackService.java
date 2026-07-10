package com.lovenotes.server.compliance;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.domain.ContentFeedbackEntity;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.message.MessageService;
import com.lovenotes.server.moment.MomentService;
import com.lovenotes.server.repository.ActiveCoupleMemberRepository;
import com.lovenotes.server.repository.ContentFeedbackRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.*;

@Service
public class FeedbackService {
    private static final Set<String> RESOURCE_TYPES = Set.of("MOMENT", "RECAP", "PET", "ACCOUNT", "OTHER");

    private final ContentFeedbackRepository feedback;
    private final ActiveCoupleMemberRepository members;
    private final MomentService moments;
    private final MessageService messages;
    private final AuditService audit;

    public FeedbackService(ContentFeedbackRepository feedback, ActiveCoupleMemberRepository members,
                           MomentService moments, MessageService messages, AuditService audit) {
        this.feedback = feedback;
        this.members = members;
        this.moments = moments;
        this.messages = messages;
        this.audit = audit;
    }

    @Transactional
    public FeedbackView create(UUID actorId, String resourceType, UUID resourceId,
                               DomainEnums.FeedbackCategory category, String description, String requestId) {
        String normalizedType = normalizeResourceType(resourceType);
        if ("MOMENT".equals(normalizedType)) {
            if (resourceId == null) throw validation("反馈记录内容时需要提供记录 ID。");
            moments.get(actorId, resourceId);
        }
        String normalizedDescription = normalizeDescription(description);
        UUID coupleId = members.findById(actorId).map(member -> member.getCoupleId()).orElse(null);
        ContentFeedbackEntity entity = feedback.save(new ContentFeedbackEntity(
                actorId, coupleId, normalizedType, resourceId,
                category == null ? DomainEnums.FeedbackCategory.OTHER : category,
                normalizedDescription));
        audit.record(actorId, coupleId, normalizedType, resourceId, "CONTENT_FEEDBACK_CREATE", "SUCCESS",
                entity.getCategory().name(), requestId, Map.of("feedback_id", entity.getId().toString()));
        return FeedbackView.from(entity);
    }

    @Transactional(readOnly = true)
    public List<FeedbackView> mine(UUID actorId, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 50));
        return feedback.findByReporterIdOrderByCreatedAtDesc(actorId, PageRequest.of(0, safeLimit))
                .stream().map(FeedbackView::from).toList();
    }

    @Transactional(readOnly = true)
    public List<InternalFeedbackView> listForInternal(DomainEnums.FeedbackStatus status, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 100));
        var pageable = PageRequest.of(0, safeLimit);
        List<ContentFeedbackEntity> items = status == null
                ? feedback.findByStatusInOrderByCreatedAtAsc(
                        List.of(DomainEnums.FeedbackStatus.OPEN, DomainEnums.FeedbackStatus.IN_REVIEW), pageable)
                : feedback.findByStatusOrderByCreatedAtAsc(status, pageable);
        return items.stream().map(InternalFeedbackView::from).toList();
    }

    @Transactional
    public InternalFeedbackView updateStatus(UUID id, DomainEnums.FeedbackStatus status, String note,
                                             String operator, String requestId) {
        if (status == null) throw validation("处理状态不能为空。");
        ContentFeedbackEntity entity = feedback.findById(id).orElseThrow(this::notFound);
        DomainEnums.FeedbackStatus previous = entity.getStatus();
        entity.changeStatus(status);

        String safeNote = normalizeNote(note);
        String safeOperator = normalizeOperator(operator);
        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("feedback_id", entity.getId().toString());
        metadata.put("previous_status", previous.name());
        metadata.put("new_status", status.name());
        metadata.put("operator", safeOperator);
        audit.record(null, entity.getCoupleId(), "CONTENT_FEEDBACK", entity.getId(),
                "CONTENT_FEEDBACK_STATUS_CHANGE", "SUCCESS", safeNote, requestId, metadata);

        if (previous != status) {
            messages.notifySystem(List.of(entity.getReporterId()), null, entity.getCoupleId(),
                    "反馈处理状态已更新", feedbackStatusSummary(status));
        }
        return InternalFeedbackView.from(entity);
    }

    private String normalizeResourceType(String resourceType) {
        String normalized = resourceType == null ? "OTHER" : resourceType.trim().toUpperCase(Locale.ROOT);
        if (!RESOURCE_TYPES.contains(normalized)) throw validation("反馈对象类型不正确。");
        return normalized;
    }

    private String normalizeDescription(String description) {
        String normalized = description == null ? "" : description.trim().replaceAll("\\s+", " ");
        if (normalized.length() < 5) throw validation("请至少填写 5 个字的反馈说明。");
        if (normalized.length() > 500) throw validation("反馈说明最多 500 个字。");
        return normalized;
    }

    private String normalizeNote(String note) {
        if (note == null || note.isBlank()) return null;
        String normalized = note.trim().replaceAll("\\s+", " ");
        return normalized.length() <= 240 ? normalized : normalized.substring(0, 240);
    }

    private String normalizeOperator(String operator) {
        String normalized = operator == null || operator.isBlank() ? "internal" : operator.trim().replaceAll("\\s+", " ");
        return normalized.length() <= 80 ? normalized : normalized.substring(0, 80);
    }

    private String feedbackStatusSummary(DomainEnums.FeedbackStatus status) {
        return switch (status) {
            case IN_REVIEW -> "你的反馈已进入处理流程。";
            case RESOLVED -> "你的反馈已处理完成。";
            case REJECTED -> "你的反馈已完成复核，本次未采纳。";
            case OPEN -> "你的反馈已重新打开。";
        };
    }

    private ApiException validation(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "FEEDBACK_NOT_FOUND", "反馈不存在。");
    }

    public record FeedbackView(UUID id, String resourceType, UUID resourceId,
                               DomainEnums.FeedbackCategory category, DomainEnums.FeedbackStatus status,
                               String description, Instant createdAt, Instant updatedAt) {
        static FeedbackView from(ContentFeedbackEntity entity) {
            return new FeedbackView(entity.getId(), entity.getResourceType(), entity.getResourceId(),
                    entity.getCategory(), entity.getStatus(), entity.getDescription(),
                    entity.getCreatedAt(), entity.getUpdatedAt());
        }
    }

    public record InternalFeedbackView(UUID id, UUID reporterId, UUID coupleId, String resourceType, UUID resourceId,
                                       DomainEnums.FeedbackCategory category, DomainEnums.FeedbackStatus status,
                                       String description, Instant createdAt, Instant updatedAt) {
        static InternalFeedbackView from(ContentFeedbackEntity entity) {
            return new InternalFeedbackView(entity.getId(), entity.getReporterId(), entity.getCoupleId(),
                    entity.getResourceType(), entity.getResourceId(), entity.getCategory(), entity.getStatus(),
                    entity.getDescription(), entity.getCreatedAt(), entity.getUpdatedAt());
        }
    }
}
