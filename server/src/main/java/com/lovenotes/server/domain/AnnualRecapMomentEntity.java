package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.util.UUID;

@Entity
@Table(name = "annual_recap_moment", uniqueConstraints = @UniqueConstraint(name = "uk_annual_recap_moment", columnNames = {"recap_id", "moment_id"}))
public class AnnualRecapMomentEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "recap_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID recapId;
    @Column(name = "moment_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID momentId;
    @Column(name = "sort_order", nullable = false)
    private int sortOrder;

    protected AnnualRecapMomentEntity() {}

    public AnnualRecapMomentEntity(UUID recapId, UUID momentId, int sortOrder) {
        this.id = UuidV7.next();
        this.recapId = recapId;
        this.momentId = momentId;
        this.sortOrder = sortOrder;
    }

    public UUID getMomentId() { return momentId; }
    public int getSortOrder() { return sortOrder; }
}
