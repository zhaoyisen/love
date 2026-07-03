package com.lovenotes.server.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "active_couple_member")
public class ActiveCoupleMemberEntity {
    @Id @Column(name = "user_id") @JdbcTypeCode(SqlTypes.BINARY)
    private UUID userId;
    @Column(name = "couple_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "joined_at", nullable = false)
    private Instant joinedAt;

    protected ActiveCoupleMemberEntity() {}
    public ActiveCoupleMemberEntity(UUID userId, UUID coupleId) {
        this.userId = userId; this.coupleId = coupleId; this.joinedAt = Instant.now();
    }
    public UUID getUserId() { return userId; }
    public UUID getCoupleId() { return coupleId; }
}
