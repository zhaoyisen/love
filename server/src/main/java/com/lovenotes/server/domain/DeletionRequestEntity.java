package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "deletion_request")
public class DeletionRequestEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "requester_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID requesterId;
    @Enumerated(EnumType.STRING)
    @Column(name = "request_type", nullable = false, length = 30)
    private DomainEnums.DeletionRequestType requestType;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DomainEnums.DeletionRequestStatus status;
    @Column(length = 200)
    private String reason;
    @Column(name = "status_token_hash", nullable = false, length = 64)
    private String statusTokenHash;
    @Column(name = "requested_at", nullable = false)
    private Instant requestedAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;
    @Column(name = "completed_at")
    private Instant completedAt;
    @Column(name = "processed_moments", nullable = false)
    private int processedMoments;
    @Column(name = "processed_media_assets", nullable = false)
    private int processedMediaAssets;
    @Column(name = "processed_comments", nullable = false)
    private int processedComments;
    @Column(name = "processed_reactions", nullable = false)
    private int processedReactions;
    @Column(name = "processed_derived_assets", nullable = false)
    private int processedDerivedAssets;
    @Column(name = "failure_reason", length = 240)
    private String failureReason;

    protected DeletionRequestEntity() {}

    public DeletionRequestEntity(UUID requesterId, String reason, String statusTokenHash) {
        this.id = UuidV7.next();
        this.requesterId = requesterId;
        this.requestType = DomainEnums.DeletionRequestType.ACCOUNT_DELETION;
        this.status = DomainEnums.DeletionRequestStatus.PENDING;
        this.reason = reason;
        this.statusTokenHash = statusTokenHash;
        this.requestedAt = Instant.now();
        this.updatedAt = requestedAt;
        this.processedMoments = 0;
        this.processedMediaAssets = 0;
        this.processedComments = 0;
        this.processedReactions = 0;
        this.processedDerivedAssets = 0;
    }

    @PreUpdate
    void touch() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getRequesterId() { return requesterId; }
    public DomainEnums.DeletionRequestType getRequestType() { return requestType; }
    public DomainEnums.DeletionRequestStatus getStatus() { return status; }
    public String getReason() { return reason; }
    public String getStatusTokenHash() { return statusTokenHash; }
    public Instant getRequestedAt() { return requestedAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public Instant getCompletedAt() { return completedAt; }
    public int getProcessedMoments() { return processedMoments; }
    public int getProcessedMediaAssets() { return processedMediaAssets; }
    public int getProcessedComments() { return processedComments; }
    public int getProcessedReactions() { return processedReactions; }
    public int getProcessedDerivedAssets() { return processedDerivedAssets; }
    public String getFailureReason() { return failureReason; }
    public void markProcessing() {
        if (status == DomainEnums.DeletionRequestStatus.PENDING) {
            status = DomainEnums.DeletionRequestStatus.PROCESSING;
        }
        failureReason = null;
    }
    public void markCompleted(int processedMoments, int processedMediaAssets, int processedComments,
                              int processedReactions, int processedDerivedAssets) {
        status = DomainEnums.DeletionRequestStatus.COMPLETED;
        this.processedMoments = processedMoments;
        this.processedMediaAssets = processedMediaAssets;
        this.processedComments = processedComments;
        this.processedReactions = processedReactions;
        this.processedDerivedAssets = processedDerivedAssets;
        failureReason = null;
        completedAt = Instant.now();
    }
    public void markFailed(String failureReason) {
        status = DomainEnums.DeletionRequestStatus.FAILED;
        this.failureReason = safe(failureReason);
    }
    public void markRetryPending() {
        status = DomainEnums.DeletionRequestStatus.PENDING;
        failureReason = null;
        completedAt = null;
    }

    private String safe(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        return normalized.length() <= 240 ? normalized : normalized.substring(0, 240);
    }
}
