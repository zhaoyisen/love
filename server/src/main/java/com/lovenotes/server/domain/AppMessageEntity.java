package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_message")
public class AppMessageEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "recipient_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID recipientId;
    @Column(name = "actor_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID actorId;
    @Column(name = "couple_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "moment_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID momentId;
    @Enumerated(EnumType.STRING)
    @Column(name = "message_type", nullable = false, length = 20)
    private DomainEnums.MessageType type;
    @Column(nullable = false, length = 80)
    private String title;
    @Column(nullable = false, length = 240)
    private String summary;
    @Column(name = "read_at")
    private Instant readAt;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected AppMessageEntity() {}

    public AppMessageEntity(UUID recipientId, UUID actorId, UUID coupleId, UUID momentId,
                            DomainEnums.MessageType type, String title, String summary) {
        this.id = UuidV7.next();
        this.recipientId = recipientId;
        this.actorId = actorId;
        this.coupleId = coupleId;
        this.momentId = momentId;
        this.type = type;
        this.title = title;
        this.summary = summary;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getRecipientId() { return recipientId; }
    public UUID getActorId() { return actorId; }
    public UUID getCoupleId() { return coupleId; }
    public UUID getMomentId() { return momentId; }
    public DomainEnums.MessageType getType() { return type; }
    public String getTitle() { return title; }
    public String getSummary() { return summary; }
    public Instant getReadAt() { return readAt; }
    public Instant getCreatedAt() { return createdAt; }
    public void markRead() { if (readAt == null) readAt = Instant.now(); }
}
