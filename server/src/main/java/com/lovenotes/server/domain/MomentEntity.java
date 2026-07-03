package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "moment")
public class MomentEntity {
    @Id @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "author_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID authorId;
    @Column(name = "couple_id") @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private DomainEnums.MomentType type;
    @Column(length = 30)
    private String title;
    @Column(nullable = false, length = 1000)
    private String body;
    @Column(name = "occurred_at", nullable = false)
    private Instant occurredAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private DomainEnums.Visibility visibility;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 24)
    private DomainEnums.MomentStatus status;
    @Version
    private int version;
    @Column(name = "deleted_at")
    private Instant deletedAt;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MomentEntity() {}
    public MomentEntity(UUID authorId, UUID coupleId, DomainEnums.MomentType type, String title, String body,
                        Instant occurredAt, DomainEnums.Visibility visibility, DomainEnums.MomentStatus status) {
        this.id = UuidV7.next(); this.authorId = authorId; this.coupleId = coupleId; this.type = type;
        this.title = title; this.body = body; this.occurredAt = occurredAt;
        this.visibility = visibility; this.status = status;
        this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }
    @PreUpdate void touch() { updatedAt = Instant.now(); }
    public UUID getId() { return id; }
    public UUID getAuthorId() { return authorId; }
    public UUID getCoupleId() { return coupleId; }
    public DomainEnums.MomentType getType() { return type; }
    public String getTitle() { return title; }
    public String getBody() { return body; }
    public Instant getOccurredAt() { return occurredAt; }
    public DomainEnums.Visibility getVisibility() { return visibility; }
    public DomainEnums.MomentStatus getStatus() { return status; }
    public int getVersion() { return version; }
    public Instant getCreatedAt() { return createdAt; }
    public void trash() { this.status = DomainEnums.MomentStatus.TRASHED; this.deletedAt = Instant.now(); }
    public void restore(boolean keepShared) { this.status = DomainEnums.MomentStatus.PUBLISHED; this.deletedAt = null; if (!keepShared) { this.visibility = DomainEnums.Visibility.PRIVATE; this.coupleId = null; } }
    public void update(String title, String body, Instant occurredAt, DomainEnums.Visibility visibility, UUID coupleId) {
        this.title = title; this.body = body; this.occurredAt = occurredAt; this.visibility = visibility; this.coupleId = coupleId;
    }
}
