package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.*;
import java.util.UUID;

@Entity
@Table(name = "pet_growth_ledger", uniqueConstraints = @UniqueConstraint(
        name = "uk_pet_growth_source", columnNames = {"pet_id", "source_type", "source_id", "rule_version"}))
public class PetGrowthLedgerEntity {
    @Id @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "pet_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID petId;
    @Column(name = "couple_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "actor_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID actorId;
    @Enumerated(EnumType.STRING) @Column(name = "source_type", nullable = false, length = 30)
    private DomainEnums.PetGrowthSource sourceType;
    @Column(name = "source_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID sourceId;
    @Column(name = "rule_version", nullable = false)
    private int ruleVersion;
    @Column(name = "action_date", nullable = false)
    private LocalDate actionDate;
    @Column(nullable = false)
    private int delta;
    @Column(name = "reversed_at")
    private Instant reversedAt;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected PetGrowthLedgerEntity() {}

    public PetGrowthLedgerEntity(UUID petId, UUID coupleId, UUID actorId, DomainEnums.PetGrowthSource sourceType,
                                 UUID sourceId, int ruleVersion, LocalDate actionDate, int delta) {
        this.id = UuidV7.next(); this.petId = petId; this.coupleId = coupleId; this.actorId = actorId;
        this.sourceType = sourceType; this.sourceId = sourceId; this.ruleVersion = ruleVersion;
        this.actionDate = actionDate; this.delta = delta; this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getPetId() { return petId; }
    public UUID getActorId() { return actorId; }
    public DomainEnums.PetGrowthSource getSourceType() { return sourceType; }
    public UUID getSourceId() { return sourceId; }
    public LocalDate getActionDate() { return actionDate; }
    public int getDelta() { return delta; }
    public Instant getCreatedAt() { return createdAt; }
    public Instant getReversedAt() { return reversedAt; }
    public void reverse() { if (reversedAt == null) reversedAt = Instant.now(); }
    public void restore() { reversedAt = null; }
}
