package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

@Entity
@Table(name = "derived_asset")
public class DerivedAssetEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "owner_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID ownerId;
    @Column(name = "source_type", nullable = false, length = 40)
    private String sourceType;
    @Column(name = "source_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID sourceId;
    @Column(name = "source_asset_ids", length = 400)
    private String sourceAssetIds;
    @Column(name = "rendered_media_asset_id", unique = true)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID renderedMediaAssetId;
    @Column(name = "template_id", length = 60)
    private String templateId;
    @Column(name = "template_version")
    private Integer templateVersion;
    @Column(name = "render_config", length = 2000)
    private String renderConfig;
    @Column(name = "storage_key", nullable = false, unique = true, length = 300)
    private String storageKey;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DomainEnums.DerivedAssetStatus status;
    @Column(name = "failure_reason", length = 240)
    private String failureReason;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected DerivedAssetEntity() {}

    public DerivedAssetEntity(UUID ownerId, String sourceType, UUID sourceId, String storageKey) {
        this.id = UuidV7.next();
        this.ownerId = ownerId;
        this.sourceType = normalizeSourceType(sourceType);
        this.sourceId = sourceId;
        this.storageKey = storageKey;
        this.status = DomainEnums.DerivedAssetStatus.READY;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    public DerivedAssetEntity(UUID ownerId, List<UUID> sourceAssetIds, UUID renderedMediaAssetId,
                              String storageKey, String templateId, int templateVersion,
                              String renderConfig, DomainEnums.DerivedAssetStatus status) {
        this.id = UuidV7.next();
        this.ownerId = ownerId;
        this.sourceType = "IMAGE_TEMPLATE";
        this.sourceId = sourceAssetIds == null || sourceAssetIds.isEmpty() ? null : sourceAssetIds.getFirst();
        this.sourceAssetIds = joinSourceAssets(sourceAssetIds);
        this.renderedMediaAssetId = renderedMediaAssetId;
        this.storageKey = storageKey;
        this.templateId = templateId;
        this.templateVersion = templateVersion;
        this.renderConfig = safeConfig(renderConfig);
        this.status = status == null ? DomainEnums.DerivedAssetStatus.PENDING : status;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate
    void touch() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getOwnerId() { return ownerId; }
    public String getSourceType() { return sourceType; }
    public UUID getSourceId() { return sourceId; }
    public String getStorageKey() { return storageKey; }
    public List<UUID> getSourceAssetIds() {
        if (sourceAssetIds == null || sourceAssetIds.isBlank()) return sourceId == null ? List.of() : List.of(sourceId);
        return Arrays.stream(sourceAssetIds.split(","))
                .map(String::trim).filter(value -> !value.isBlank()).map(UUID::fromString).toList();
    }
    public UUID getRenderedMediaAssetId() { return renderedMediaAssetId; }
    public String getTemplateId() { return templateId; }
    public Integer getTemplateVersion() { return templateVersion; }
    public String getRenderConfig() { return renderConfig; }
    public DomainEnums.DerivedAssetStatus getStatus() { return status; }
    public String getFailureReason() { return failureReason; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void markDeleted() {
        status = DomainEnums.DerivedAssetStatus.DELETED;
        failureReason = null;
    }

    public void markReady() {
        status = DomainEnums.DerivedAssetStatus.READY;
        failureReason = null;
    }

    public void markFailed(String reason) {
        status = DomainEnums.DerivedAssetStatus.FAILED;
        failureReason = safe(reason);
    }

    private String normalizeSourceType(String value) {
        if (value == null || value.isBlank()) return "UNKNOWN";
        String normalized = value.trim().replaceAll("\\s+", "_").toUpperCase();
        return normalized.length() <= 40 ? normalized : normalized.substring(0, 40);
    }

    private String safe(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        return normalized.length() <= 240 ? normalized : normalized.substring(0, 240);
    }

    private String joinSourceAssets(List<UUID> values) {
        if (values == null || values.isEmpty()) return null;
        return values.stream().filter(java.util.Objects::nonNull).distinct().map(UUID::toString)
                .reduce((left, right) -> left + "," + right).orElse(null);
    }

    private String safeConfig(String value) {
        if (value == null || value.isBlank()) return null;
        String normalized = value.trim();
        return normalized.length() <= 2000 ? normalized : normalized.substring(0, 2000);
    }
}
