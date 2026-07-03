package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "upload_session")
public class UploadSessionEntity {
    @Id @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "asset_id", nullable = false, unique = true) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID assetId;
    @Column(name = "user_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID userId;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private DomainEnums.UploadStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UploadSessionEntity() {}
    public UploadSessionEntity(UUID assetId, UUID userId, Instant expiresAt) {
        this.id = UuidV7.next(); this.assetId = assetId; this.userId = userId; this.expiresAt = expiresAt;
        this.status = DomainEnums.UploadStatus.CREATED; this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }
    @PreUpdate void touch() { updatedAt = Instant.now(); }
    public UUID getId() { return id; }
    public UUID getAssetId() { return assetId; }
    public UUID getUserId() { return userId; }
    public Instant getExpiresAt() { return expiresAt; }
    public DomainEnums.UploadStatus getStatus() { return status; }
    public void complete() { this.status = DomainEnums.UploadStatus.COMPLETED; }
}
