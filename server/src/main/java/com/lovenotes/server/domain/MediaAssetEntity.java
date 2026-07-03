package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "media_asset")
public class MediaAssetEntity {
    @Id @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "uploader_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID uploaderId;
    @Column(name = "moment_id") @JdbcTypeCode(SqlTypes.BINARY)
    private UUID momentId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 10)
    private DomainEnums.MediaKind kind;
    @Column(name = "storage_key", nullable = false, unique = true, length = 300)
    private String storageKey;
    @Column(length = 64)
    private String sha256;
    @Column(name = "mime_type", nullable = false, length = 100)
    private String mimeType;
    @Column(name = "size_bytes", nullable = false)
    private long sizeBytes;
    @Column(length = 100)
    private String etag;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private DomainEnums.MediaStatus status;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MediaAssetEntity() {}
    public MediaAssetEntity(UUID uploaderId, DomainEnums.MediaKind kind, String storageKey, String sha256, String mimeType, long sizeBytes) {
        this.id = UuidV7.next(); this.uploaderId = uploaderId; this.kind = kind; this.storageKey = storageKey;
        this.sha256 = sha256; this.mimeType = mimeType; this.sizeBytes = sizeBytes; this.status = DomainEnums.MediaStatus.CREATED;
        this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }
    @PreUpdate void touch() { updatedAt = Instant.now(); }
    public UUID getId() { return id; }
    public UUID getUploaderId() { return uploaderId; }
    public String getStorageKey() { return storageKey; }
    public DomainEnums.MediaKind getKind() { return kind; }
    public DomainEnums.MediaStatus getStatus() { return status; }
    public long getSizeBytes() { return sizeBytes; }
    public void complete(String etag) { this.etag = etag; this.status = DomainEnums.MediaStatus.UPLOADED; }
    public void attach(UUID momentId) { this.momentId = momentId; }
}
