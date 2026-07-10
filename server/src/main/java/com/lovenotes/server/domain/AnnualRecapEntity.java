package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "annual_recap", uniqueConstraints = @UniqueConstraint(name = "uk_annual_recap_couple_year", columnNames = {"couple_id", "recap_year"}))
public class AnnualRecapEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "couple_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID coupleId;
    @Column(name = "recap_year", nullable = false)
    private int year;
    @Column(nullable = false, length = 30)
    private String title;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 10)
    private DomainEnums.RecapStatus status;
    @Column(nullable = false)
    private int version;
    @Column(name = "generated_at")
    private Instant generatedAt;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected AnnualRecapEntity() {}

    public AnnualRecapEntity(UUID coupleId, int year) {
        this.id = UuidV7.next();
        this.coupleId = coupleId;
        this.year = year;
        this.title = "我们的 " + year;
        this.status = DomainEnums.RecapStatus.DRAFT;
        this.version = 1;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate
    void touch() { updatedAt = Instant.now(); }

    public UUID getId() { return id; }
    public UUID getCoupleId() { return coupleId; }
    public int getYear() { return year; }
    public String getTitle() { return title; }
    public DomainEnums.RecapStatus getStatus() { return status; }
    public int getVersion() { return version; }
    public Instant getGeneratedAt() { return generatedAt; }

    public void updateDraft(String title) {
        this.title = title;
        this.status = DomainEnums.RecapStatus.DRAFT;
        this.version += 1;
        this.generatedAt = null;
    }

    public void markReady() {
        if (status == DomainEnums.RecapStatus.READY) version += 1;
        this.status = DomainEnums.RecapStatus.READY;
        this.generatedAt = Instant.now();
    }
}
