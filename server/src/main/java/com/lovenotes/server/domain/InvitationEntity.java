package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "invitation")
public class InvitationEntity {
    @Id @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "inviter_id", nullable = false) @JdbcTypeCode(SqlTypes.BINARY)
    private UUID inviterId;
    @Column(name = "token_hash", nullable = false, unique = true, length = 64)
    private String tokenHash;
    @Column(name = "expires_at", nullable = false)
    private Instant expiresAt;
    @Enumerated(EnumType.STRING) @Column(nullable = false, length = 20)
    private DomainEnums.InvitationStatus status;
    @Column(name = "accepted_by") @JdbcTypeCode(SqlTypes.BINARY)
    private UUID acceptedBy;
    @Version
    private int version;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected InvitationEntity() {}
    public InvitationEntity(UUID inviterId, String tokenHash, Instant expiresAt) {
        this.id = UuidV7.next(); this.inviterId = inviterId; this.tokenHash = tokenHash;
        this.expiresAt = expiresAt; this.status = DomainEnums.InvitationStatus.ACTIVE;
        this.createdAt = Instant.now(); this.updatedAt = createdAt;
    }
    @PreUpdate void touch() { updatedAt = Instant.now(); }
    public UUID getId() { return id; }
    public UUID getInviterId() { return inviterId; }
    public Instant getExpiresAt() { return expiresAt; }
    public DomainEnums.InvitationStatus getStatus() { return status; }
    public int getVersion() { return version; }
    public void accept(UUID userId) { this.status = DomainEnums.InvitationStatus.ACCEPTED; this.acceptedBy = userId; }
    public void revoke() { this.status = DomainEnums.InvitationStatus.REVOKED; }
    public void expire() { this.status = DomainEnums.InvitationStatus.EXPIRED; }
}
