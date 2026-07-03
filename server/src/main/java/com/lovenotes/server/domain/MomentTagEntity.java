package com.lovenotes.server.domain;

import jakarta.persistence.*;

@Entity
@Table(name = "moment_tag")
public class MomentTagEntity {
    @EmbeddedId
    private MomentTagId id;
    protected MomentTagEntity() {}
    public MomentTagEntity(MomentTagId id) { this.id = id; }
    public MomentTagId getId() { return id; }
}
