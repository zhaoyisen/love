package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "pet_adoption_proposal", uniqueConstraints = @UniqueConstraint(name = "uk_pet_adoption_couple", columnNames = "couple_id"))
public class PetAdoptionProposalEntity {
    @Id @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "couple_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "proposer_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID proposerId;
    @Column(nullable = false, length = 30)
    private String kind;
    @Column(nullable = false, length = 30)
    private String name;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PetAdoptionProposalEntity() {}

    public PetAdoptionProposalEntity(UUID coupleId, UUID proposerId, String kind, String name) {
        this.id = UuidV7.next();
        this.coupleId = coupleId;
        this.proposerId = proposerId;
        this.kind = kind;
        this.name = name;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate void touch() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getCoupleId() { return coupleId; }
    public UUID getProposerId() { return proposerId; }
    public String getKind() { return kind; }
    public String getName() { return name; }
    public Instant getCreatedAt() { return createdAt; }
    public void revise(String kind, String name) { this.kind = kind; this.name = name; }
}
