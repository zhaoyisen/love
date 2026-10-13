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
    public static final int MAX_LEVEL = 10;
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
    @Column(name = "last_renamed_at")
    private Instant lastRenamedAt;

    protected PetStateEntity() {}

    public PetStateEntity(UUID coupleId, String kind, String name) {
        this.id = UuidV7.next();
        this.coupleId = coupleId;
        this.name = name;
        this.kind = kind;
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
    public Instant getLastRenamedAt() { return lastRenamedAt; }

    public int addGrowth(int delta) {
        if (delta <= 0 || level >= MAX_LEVEL) return 0;
        int beforeScore = (level - 1) * 100 + growth;
        int total = growth + delta;
        while (total >= 100 && level < MAX_LEVEL) {
            level += 1;
            total -= 100;
        }
        growth = level >= MAX_LEVEL ? 0 : Math.max(0, total);
        int afterScore = (level - 1) * 100 + growth;
        return Math.max(0, afterScore - beforeScore);
    }

    public int removeGrowthPreservingLevel(int delta) {
        if (delta <= 0) return 0;
        int removed = Math.min(growth, delta);
        growth -= removed;
        return removed;
    }

    public void rename(String name) {
        this.name = name;
        this.lastRenamedAt = Instant.now();
    }
}
