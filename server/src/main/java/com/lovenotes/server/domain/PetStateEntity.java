package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "pet_state", uniqueConstraints = @UniqueConstraint(name = "uk_pet_state_couple", columnNames = "couple_id"))
public class PetStateEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "couple_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(nullable = false, length = 30)
    private String name;
    @Column(nullable = false, length = 30)
    private String kind;
    @Column(nullable = false)
    private int level;
    @Column(nullable = false)
    private int growth;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected PetStateEntity() {}

    public PetStateEntity(UUID coupleId) {
        this.id = UuidV7.next();
        this.coupleId = coupleId;
        this.name = "团子";
        this.kind = "云朵猫";
        this.level = 1;
        this.growth = 0;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate
    void touch() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getCoupleId() { return coupleId; }
    public String getName() { return name; }
    public String getKind() { return kind; }
    public int getLevel() { return level; }
    public int getGrowth() { return growth; }

    public void addGrowth(int delta) {
        int total = growth + delta;
        while (total >= 100) {
            level += 1;
            total -= 100;
        }
        growth = Math.max(0, total);
    }
}
