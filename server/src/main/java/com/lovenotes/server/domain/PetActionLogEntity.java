package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.*;
import java.util.UUID;

@Entity
@Table(
        name = "pet_action_log",
        uniqueConstraints = @UniqueConstraint(name = "uk_pet_daily_action", columnNames = {"couple_id", "actor_id", "action_type", "action_date"})
)
public class PetActionLogEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "pet_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID petId;
    @Column(name = "couple_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "actor_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID actorId;
    @Enumerated(EnumType.STRING)
    @Column(name = "action_type", nullable = false, length = 10)
    private DomainEnums.PetAction actionType;
    @Column(name = "action_date", nullable = false)
    private LocalDate actionDate;
    @Column(name = "growth_delta", nullable = false)
    private int growthDelta;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PetActionLogEntity() {}

    public PetActionLogEntity(UUID petId, UUID coupleId, UUID actorId, DomainEnums.PetAction actionType,
                              LocalDate actionDate, int growthDelta) {
        this.id = UuidV7.next();
        this.petId = petId;
        this.coupleId = coupleId;
        this.actorId = actorId;
        this.actionType = actionType;
        this.actionDate = actionDate;
        this.growthDelta = growthDelta;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPetId() { return petId; }
    public UUID getActorId() { return actorId; }
    public DomainEnums.PetAction getActionType() { return actionType; }
    public LocalDate getActionDate() { return actionDate; }
    public int getGrowthDelta() { return growthDelta; }
    public Instant getCreatedAt() { return createdAt; }
}
