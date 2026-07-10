package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "audit_log")
public class AuditLogEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "actor_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID actorId;
    @Column(name = "couple_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "resource_type", nullable = false, length = 40)
    private String resourceType;
    @Column(name = "resource_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID resourceId;
    @Column(nullable = false, length = 60)
    private String action;
    @Column(nullable = false, length = 20)
    private String result;
    @Column(length = 240)
    private String reason;
    @Column(name = "request_id", length = 80)
    private String requestId;
    @Column(name = "metadata_json", columnDefinition = "TEXT")
    private String metadataJson;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AuditLogEntity() {}

    public AuditLogEntity(UUID actorId, UUID coupleId, String resourceType, UUID resourceId,
                          String action, String result, String reason, String requestId, String metadataJson) {
        this.id = UuidV7.next();
        this.actorId = actorId;
        this.coupleId = coupleId;
        this.resourceType = resourceType;
        this.resourceId = resourceId;
        this.action = action;
        this.result = result;
        this.reason = reason;
        this.requestId = requestId;
        this.metadataJson = metadataJson;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getActorId() { return actorId; }
    public UUID getCoupleId() { return coupleId; }
    public String getResourceType() { return resourceType; }
    public UUID getResourceId() { return resourceId; }
    public String getAction() { return action; }
    public String getResult() { return result; }
    public String getReason() { return reason; }
    public String getRequestId() { return requestId; }
    public String getMetadataJson() { return metadataJson; }
    public Instant getCreatedAt() { return createdAt; }
}
