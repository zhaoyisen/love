package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "content_feedback")
public class ContentFeedbackEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "reporter_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID reporterId;
    @Column(name = "couple_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "resource_type", nullable = false, length = 40)
    private String resourceType;
    @Column(name = "resource_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID resourceId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 30)
    private DomainEnums.FeedbackCategory category;
    @Column(nullable = false, length = 500)
    private String description;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DomainEnums.FeedbackStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected ContentFeedbackEntity() {}

    public ContentFeedbackEntity(UUID reporterId, UUID coupleId, String resourceType, UUID resourceId,
                                 DomainEnums.FeedbackCategory category, String description) {
        this.id = UuidV7.next();
        this.reporterId = reporterId;
        this.coupleId = coupleId;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.category = category;
        this.description = description;
        this.status = DomainEnums.FeedbackStatus.OPEN;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate
    void touch() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getReporterId() { return reporterId; }
    public UUID getCoupleId() { return coupleId; }
    public String getResourceType() { return resourceType; }
    public UUID getResourceId() { return resourceId; }
    public DomainEnums.FeedbackCategory getCategory() { return category; }
    public String getDescription() { return description; }
    public DomainEnums.FeedbackStatus getStatus() { return status; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }
    public void changeStatus(DomainEnums.FeedbackStatus status) {
        this.status = status;
    }
}
