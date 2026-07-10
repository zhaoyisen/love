package com.lovenotes.server.compliance;

import com.lovenotes.server.common.ApiException;
import com.lovenotes.server.common.Hashing;
import com.lovenotes.server.domain.DeletionRequestEntity;
import com.lovenotes.server.domain.DomainEnums;
import com.lovenotes.server.domain.MediaAssetEntity;
import com.lovenotes.server.domain.MomentEntity;
import com.lovenotes.server.domain.UserEntity;
import com.lovenotes.server.repository.ActiveCoupleMemberRepository;
import com.lovenotes.server.repository.DeletionRequestRepository;
import com.lovenotes.server.repository.MediaAssetRepository;
import com.lovenotes.server.repository.MomentCommentRepository;
import com.lovenotes.server.repository.MomentRepository;
import com.lovenotes.server.repository.MomentReactionRepository;
import com.lovenotes.server.repository.UserRepository;
import com.lovenotes.server.storage.ObjectStorage;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

@Service
public class AccountDeletionProcessingService {
    private static final List<DomainEnums.MomentStatus> ACCOUNT_DELETION_MOMENT_STATUSES = List.of(
            DomainEnums.MomentStatus.DRAFT,
            DomainEnums.MomentStatus.UPLOADING,
            DomainEnums.MomentStatus.PUBLISHED,
            DomainEnums.MomentStatus.PARTIAL_FAILED,
            DomainEnums.MomentStatus.TRASHED);

    private final DeletionRequestRepository deletionRequests;
    private final UserRepository users;
    private final ActiveCoupleMemberRepository members;
    private final MomentRepository moments;
    private final MediaAssetRepository assets;
    private final MomentCommentRepository comments;
    private final MomentReactionRepository reactions;
    private final ObjectStorage storage;
    private final DerivedAssetCleanupService derivedAssetCleanup;
    private final AuditService audit;

    public AccountDeletionProcessingService(DeletionRequestRepository deletionRequests, UserRepository users,
                                            ActiveCoupleMemberRepository members, MomentRepository moments,
                                            MediaAssetRepository assets, MomentCommentRepository comments,
                                            MomentReactionRepository reactions, ObjectStorage storage,
                                            DerivedAssetCleanupService derivedAssetCleanup, AuditService audit) {
        this.deletionRequests = deletionRequests;
        this.users = users;
        this.members = members;
        this.moments = moments;
        this.assets = assets;
        this.comments = comments;
        this.reactions = reactions;
        this.storage = storage;
        this.derivedAssetCleanup = derivedAssetCleanup;
        this.audit = audit;
    }

    @Transactional
    public ProcessingResult runBatch() {
        int processed = 0;
        int completed = 0;
        int failed = 0;
        int trashedMoments = 0;
        int deletedMediaAssets = 0;
        int deletedComments = 0;
        int deletedReactions = 0;
        int deletedDerivedAssets = 0;

        for (DeletionRequestEntity request : deletionRequests.findTop20ByStatusOrderByRequestedAtAsc(DomainEnums.DeletionRequestStatus.PENDING)) {
            processed++;
            request.markProcessing();
            try {
                ProcessedAccount account = process(request);
                request.markCompleted(account.trashedMoments(), account.deletedMediaAssets(),
                        account.deletedComments(), account.deletedReactions(), account.deletedDerivedAssets());
                completed++;
                trashedMoments += account.trashedMoments();
                deletedMediaAssets += account.deletedMediaAssets();
                deletedComments += account.deletedComments();
                deletedReactions += account.deletedReactions();
                deletedDerivedAssets += account.deletedDerivedAssets();

                Map<String, Object> metadata = new LinkedHashMap<>();
                metadata.put("deletion_request_id", request.getId().toString());
                metadata.put("trashed_moments", account.trashedMoments());
                metadata.put("deleted_media_assets", account.deletedMediaAssets());
                metadata.put("deleted_comments", account.deletedComments());
                metadata.put("deleted_reactions", account.deletedReactions());
                metadata.put("deleted_derived_assets", account.deletedDerivedAssets());
                metadata.put("active_membership_removed", account.activeMembershipRemoved());
                audit.record(request.getRequesterId(), null, "ACCOUNT", request.getRequesterId(),
                        "ACCOUNT_DELETION_COMPLETED", "SUCCESS", request.getReason(), null, metadata);
            } catch (Exception exception) {
                request.markFailed(exception.getClass().getSimpleName());
                failed++;

                Map<String, Object> metadata = new LinkedHashMap<>();
                metadata.put("deletion_request_id", request.getId().toString());
                metadata.put("exception", exception.getClass().getSimpleName());
                audit.record(request.getRequesterId(), null, "ACCOUNT", request.getRequesterId(),
                        "ACCOUNT_DELETION_FAILED", "FAILED", request.getReason(), null, metadata);
            }
        }
        return new ProcessingResult(processed, completed, failed, trashedMoments, deletedMediaAssets,
                deletedComments, deletedReactions, deletedDerivedAssets);
    }

    @Transactional
    public DeletionRequestEntity retryFailed(UUID requestId, String operator, String requestIdHeader) {
        DeletionRequestEntity request = deletionRequests.findById(requestId).orElseThrow(this::notFound);
        if (request.getStatus() != DomainEnums.DeletionRequestStatus.FAILED) {
            throw new ApiException(HttpStatus.CONFLICT, "DELETION_REQUEST_NOT_FAILED",
                    "只有处理失败的注销申请才允许重新进入待处理队列。");
        }
        request.markRetryPending();

        Map<String, Object> metadata = new LinkedHashMap<>();
        metadata.put("deletion_request_id", request.getId().toString());
        metadata.put("operator", normalizeOperator(operator));
        audit.record(null, null, "ACCOUNT", request.getRequesterId(), "ACCOUNT_DELETION_RETRY",
                "SUCCESS", request.getReason(), requestIdHeader, metadata);
        return request;
    }

    private ProcessedAccount process(DeletionRequestEntity request) {
        UUID requesterId = request.getRequesterId();
        UserEntity user = users.findById(requesterId).orElse(null);
        boolean activeMembershipRemoved = members.existsById(requesterId);
        if (activeMembershipRemoved) members.deleteById(requesterId);

        List<MomentEntity> authoredMoments = moments.findByAuthorIdAndStatusInOrderByCreatedAtAsc(
                requesterId, ACCOUNT_DELETION_MOMENT_STATUSES);
        int deletedMediaAssets = deleteMediaAssets(requesterId, authoredMoments);
        int deletedComments = deleteComments(requesterId);
        int deletedReactions = deleteReactions(requesterId);
        int deletedDerivedAssets = derivedAssetCleanup.deleteForOwner(requesterId);

        authoredMoments.forEach(MomentEntity::anonymizeForAccountDeletion);

        if (user != null) {
            user.completeDeletion(Hashing.sha256("deleted:" + requesterId + ":" + request.getId()));
        }
        return new ProcessedAccount(authoredMoments.size(), deletedMediaAssets, deletedComments, deletedReactions,
                deletedDerivedAssets, activeMembershipRemoved);
    }

    private int deleteMediaAssets(UUID requesterId, List<MomentEntity> authoredMoments) {
        Map<UUID, MediaAssetEntity> media = new LinkedHashMap<>();
        Set<UUID> momentIds = authoredMoments.stream().map(MomentEntity::getId).collect(Collectors.toCollection(LinkedHashSet::new));
        if (!momentIds.isEmpty()) {
            collect(media, assets.findByMomentIdInOrderByCreatedAtAsc(momentIds));
        }
        collect(media, assets.findByUploaderIdAndStatusNotOrderByCreatedAtAsc(requesterId, DomainEnums.MediaStatus.DELETED));

        int deleted = 0;
        for (MediaAssetEntity asset : media.values()) {
            storage.deleteObjects(asset.objectKeys());
            if (asset.getStatus() != DomainEnums.MediaStatus.DELETED) {
                asset.markDeleted();
                deleted++;
            }
        }
        return deleted;
    }

    private void collect(Map<UUID, MediaAssetEntity> target, Collection<MediaAssetEntity> source) {
        target.putAll(source.stream().collect(Collectors.toMap(
                MediaAssetEntity::getId,
                Function.identity(),
                (existing, ignored) -> existing,
                LinkedHashMap::new)));
    }

    private int deleteComments(UUID requesterId) {
        var authoredComments = comments.findByAuthorIdOrderByCreatedAtAsc(requesterId);
        comments.deleteAll(authoredComments);
        return authoredComments.size();
    }

    private int deleteReactions(UUID requesterId) {
        var authoredReactions = reactions.findByActorIdOrderByUpdatedAtAsc(requesterId);
        reactions.deleteAll(authoredReactions);
        return authoredReactions.size();
    }

    private String normalizeOperator(String operator) {
        if (operator == null || operator.isBlank()) return "unknown";
        String normalized = operator.trim();
        return normalized.length() <= 80 ? normalized : normalized.substring(0, 80);
    }

    private ApiException notFound() {
        return new ApiException(HttpStatus.NOT_FOUND, "DELETION_REQUEST_NOT_FOUND", "注销申请不存在或已失效。");
    }

    public record ProcessingResult(int processed, int completed, int failed, int trashedMoments,
                                   int deletedMediaAssets, int deletedComments, int deletedReactions,
                                   int deletedDerivedAssets) {}
    private record ProcessedAccount(int trashedMoments, int deletedMediaAssets, int deletedComments,
                                    int deletedReactions, int deletedDerivedAssets, boolean activeMembershipRemoved) {}
}
