package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "moment_reaction",
        uniqueConstraints = @UniqueConstraint(name = "uk_moment_reaction_actor", columnNames = {"moment_id", "actor_id"})
)
public class MomentReactionEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "moment_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID momentId;
    @Column(name = "actor_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID actorId;
    @Column(name = "reaction_value", nullable = false, length = 20)
    private String value;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected MomentReactionEntity() {}

    public MomentReactionEntity(UUID momentId, UUID actorId, String value) {
        this.id = UuidV7.next();
        this.momentId = momentId;
        this.actorId = actorId;
        this.value = value;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate
    void touch() {
        updatedAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getMomentId() { return momentId; }
    public UUID getActorId() { return actorId; }
    public String getValue() { return value; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void updateValue(String value) {
        this.value = value;
    }
}
