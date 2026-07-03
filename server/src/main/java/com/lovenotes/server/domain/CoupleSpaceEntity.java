package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Entity
@Table(name = "couple_space")
public class CoupleSpaceEntity {
    @Id @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "member_a_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID memberAId;
    @Column(name = "member_b_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID memberBId;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private DomainEnums.CoupleStatus status;
    @Column(name = "relationship_name", length = 40)
    private String relationshipName;
    private LocalDate anniversary;
    @Version
    private int version;
    @Column(name = "ended_at")
    private Instant endedAt;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected CoupleSpaceEntity() {}

    public CoupleSpaceEntity(UUID first, UUID second, String relationshipName) {
        this.id = UuidV7.next();
        if (first.compareTo(second) <= 0) { this.memberAId = first; this.memberBId = second; }
        else { this.memberAId = second; this.memberBId = first; }
        this.relationshipName = relationshipName;
        this.status = DomainEnums.CoupleStatus.PAIRED;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate void touch() { updatedAt = Instant.now(); }
    public UUID getId() { return id; }
    public UUID getMemberAId() { return memberAId; }
    public UUID getMemberBId() { return memberBId; }
    public DomainEnums.CoupleStatus getStatus() { return status; }
    public String getRelationshipName() { return relationshipName; }
    public LocalDate getAnniversary() { return anniversary; }
    public int getVersion() { return version; }
    public void update(String name, LocalDate anniversary) { this.relationshipName = name; this.anniversary = anniversary; }
    public void freeze() { this.status = DomainEnums.CoupleStatus.FROZEN; this.endedAt = Instant.now(); }
}
