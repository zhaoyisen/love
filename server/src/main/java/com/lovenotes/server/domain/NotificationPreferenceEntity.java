package com.lovenotes.server.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "notification_preference")
public class NotificationPreferenceEntity {
    @Id
    @Column(name = "user_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID userId;
    @Column(name = "moment_notice", nullable = false)
    private boolean momentNotice;
    @Column(name = "reaction_notice", nullable = false)
    private boolean reactionNotice;
    @Column(name = "pet_notice", nullable = false)
    private boolean petNotice;
    @Column(name = "recap_notice", nullable = false)
    private boolean recapNotice;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected NotificationPreferenceEntity() {}

    public NotificationPreferenceEntity(UUID userId) {
        this.userId = userId;
        this.momentNotice = true;
        this.reactionNotice = true;
        this.petNotice = true;
        this.recapNotice = true;
        this.updatedAt = Instant.now();
    }

    public UUID getUserId() { return userId; }
    public boolean isMomentNotice() { return momentNotice; }
    public boolean isReactionNotice() { return reactionNotice; }
    public boolean isPetNotice() { return petNotice; }
    public boolean isRecapNotice() { return recapNotice; }
    public Instant getUpdatedAt() { return updatedAt; }

    public void update(boolean momentNotice, boolean reactionNotice, boolean petNotice, boolean recapNotice) {
        this.momentNotice = momentNotice;
        this.reactionNotice = reactionNotice;
        this.petNotice = petNotice;
        this.recapNotice = recapNotice;
        this.updatedAt = Instant.now();
    }
}
