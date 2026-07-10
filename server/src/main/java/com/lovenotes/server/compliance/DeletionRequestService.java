package com.lovenotes.server.compliance;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.common.Hashing;
import com.lovenotes.server.domain.CoupleSpaceEntity;
import com.lovenotes.server.domain.DeletionRequestEntity;
import com.lovenotes.server.domain.UserEntity;
import com.lovenotes.server.idempotency.IdempotencyStore;
import com.lovenotes.server.repository.DeletionRequestRepository;
import com.lovenotes.server.repository.UserRepository;
import com.lovenotes.server.couple.CoupleService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.*;
import java.util.*;

@Service
public class DeletionRequestService {
    private final DeletionRequestRepository deletionRequests;
    private final UserRepository users;
    private final CoupleService couples;
    private final AuditService audit;
    private final IdempotencyStore idempotency;
    private final SecureRandom random = new SecureRandom();

    public DeletionRequestService(DeletionRequestRepository deletionRequests, UserRepository users,
                                  CoupleService couples, AuditService audit, IdempotencyStore idempotency) {
        this.deletionRequests = deletionRequests;
        this.users = users;
        this.couples = couples;
        this.audit = audit;
        this.idempotency = idempotency;
    }

    @Transactional
    public CreatedDeletionRequest create(UUID actorId, String confirmText, String reason,
                                         String idempotencyKey, String requestId) {
        if (!"确认注销".equals(confirmText)) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "CONFIRM_TEXT_MISMATCH", "请输入“确认注销”。");
        }
        String replayKey = Hashing.sha256(actorId + ":account-deletion:" + idempotencyKey);
        Optional<String> replay = idempotency.get(replayKey);
        if (replay.isPresent()) {
            String[] parts = replay.get().split("\\|", 2);
            DeletionRequestEntity existing = deletionRequests.findById(UUID.fromString(parts[0])).orElseThrow(this::notFound);
            return new CreatedDeletionRequest(DeletionRequestView.from(existing), parts.length > 1 ? parts[1] : null);
        }

        UserEntity user = users.findById(actorId).orElseThrow(this::sessionExpired);
        if (user.getStatus() != com.lovenotes.server.domain.DomainEnums.UserStatus.ACTIVE) {
            throw new ApiException(HttpStatus.CONFLICT, "ACCOUNT_NOT_ACTIVE", "当前账号状态不允许重复发起注销。");
        }
        String statusToken = token();
        DeletionRequestEntity entity = deletionRequests.save(new DeletionRequestEntity(
                actorId, normalizeReason(reason), Hashing.sha256(statusToken)));
        Optional<CoupleSpaceEntity> frozenCouple = couples.freezeForAccountDeletion(actorId, requestId);

        Map<String, String> metadata = new LinkedHashMap<>();
        metadata.put("deletion_request_id", entity.getId().toString());
        frozenCouple.ifPresent(couple -> metadata.put("couple_id", couple.getId().toString()));
        audit.record(actorId, frozenCouple.map(CoupleSpaceEntity::getId).orElse(null),
                "ACCOUNT", actorId, "ACCOUNT_DELETION_REQUEST", "SUCCESS",
                entity.getReason(), requestId, metadata);

        user.beginDeletion();
        idempotency.putIfAbsent(replayKey, entity.getId() + "|" + statusToken, Duration.ofHours(24));
        return new CreatedDeletionRequest(DeletionRequestView.from(entity), statusToken);
    }

    @Transactional(readOnly = true)
    public DeletionRequestView latest(UUID actorId) {
        return deletionRequests.findFirstByRequesterIdOrderByRequestedAtDesc(actorId)
                .map(DeletionRequestView::from)
                .orElse(null);
    }

    @Transactional(readOnly = true)
    public DeletionRequestView publicStatus(UUID id, String statusToken) {
        if (statusToken == null || statusToken.isBlank()) throw forbidden();
        DeletionRequestEntity entity = deletionRequests.findById(id).orElseThrow(this::notFound);
        if (!Hashing.sha256(statusToken).equals(entity.getStatusTokenHash())) throw forbidden();
        return DeletionRequestView.from(entity);
    }

    private String normalizeReason(String reason) {
        if (reason == null || reason.isBlank()) return null;
        String normalized = reason.trim().replaceAll("\\s+", " ");
        return normalized.length() <= 200 ? normalized : normalized.substring(0, 200);
    }

    private String token() {
        byte[] bytes = new byte[32];
        random.nextBytes(bytes);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
    }

    private ApiException forbidden() {
        return new ApiException(HttpStatus.FORBIDDEN, "DELETION_STATUS_FORBIDDEN", "注销进度查询凭证无效。");
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "DELETION_REQUEST_NOT_FOUND", "注销申请不存在或已失效。");
    }

    private ApiException sessionExpired() {
        return new ApiException(HttpStatus.UNAUTHORIZED, "SESSION_EXPIRED", "登录状态已失效，请重新登录。");
    }

    public record CreatedDeletionRequest(DeletionRequestView request, String statusToken) {}
    public record DeletionRequestView(UUID id, com.lovenotes.server.domain.DomainEnums.DeletionRequestType requestType,
                                      com.lovenotes.server.domain.DomainEnums.DeletionRequestStatus status,
                                      String reason, Instant requestedAt, Instant updatedAt, Instant completedAt,
                                      int processedMoments, int processedMediaAssets, int processedComments,
                                      int processedReactions, int processedDerivedAssets, String failureReason) {
        static DeletionRequestView from(DeletionRequestEntity entity) {
            return new DeletionRequestView(entity.getId(), entity.getRequestType(), entity.getStatus(),
                    entity.getReason(), entity.getRequestedAt(), entity.getUpdatedAt(), entity.getCompletedAt(),
                    entity.getProcessedMoments(), entity.getProcessedMediaAssets(), entity.getProcessedComments(),
                    entity.getProcessedReactions(), entity.getProcessedDerivedAssets(), entity.getFailureReason());
        }
    }
}
