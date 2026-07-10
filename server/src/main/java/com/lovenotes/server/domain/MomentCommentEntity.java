package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "moment_comment")
public class MomentCommentEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "moment_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID momentId;
    @Column(name = "author_id", nullable = false)
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID authorId;
    @Column(nullable = false, length = 300)
    private String body;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected MomentCommentEntity() {}

    public MomentCommentEntity(UUID momentId, UUID authorId, String body) {
        this.id = UuidV7.next();
        this.momentId = momentId;
        this.authorId = authorId;
        this.body = body;
        this.createdAt = Instant.now();
    }

    public UUID getId() { return id; }
    public UUID getMomentId() { return momentId; }
    public UUID getAuthorId() { return authorId; }
    public String getBody() { return body; }
    public Instant getCreatedAt() { return createdAt; }
}
