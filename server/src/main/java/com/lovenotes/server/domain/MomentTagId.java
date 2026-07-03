package com.lovenotes.server.domain;

import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.io.Serializable;
import java.util.Objects;
import java.util.UUID;

@Embeddable
public class MomentTagId implements Serializable {
    @Column(name = "moment_id") @JdbcTypeCode(SqlTypes.BINARY)
    private UUID momentId;
    @Enumerated(EnumType.STRING) @Column(name = "tag_type", length = 10)
    private DomainEnums.TagType tagType;
    @Column(name = "tag_value", length = 30)
    private String tagValue;

    protected MomentTagId() {}
    public MomentTagId(UUID momentId, DomainEnums.TagType tagType, String tagValue) { this.momentId = momentId; this.tagType = tagType; this.tagValue = tagValue; }
    public UUID getMomentId() { return momentId; }
    public DomainEnums.TagType getTagType() { return tagType; }
    public String getTagValue() { return tagValue; }
    @Override public boolean equals(Object value) { if (this == value) return true; if (!(value instanceof MomentTagId other)) return false; return Objects.equals(momentId, other.momentId) && tagType == other.tagType && Objects.equals(tagValue, other.tagValue); }
    @Override public int hashCode() { return Objects.hash(momentId, tagType, tagValue); }
}
