package com.lovenotes.server.domain;

import com.lovenotes.server.common.UuidV7;
import jakarta.persistence.*;
import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(name = "app_user")
public class UserEntity {
    @Id
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID id;
    @Column(name = "wx_ref_hash", nullable = false, unique = true, length = 64)
    private String wxRefHash;
    @Column(name = "wx_ref_cipher", length = 512)
    private String wxRefCipher;
    @Column(nullable = false, length = 30)
    private String nickname;
    @Column(name = "avatar_media_id")
    @JdbcTypeCode(SqlTypes.BINARY)
    private UUID avatarMediaId;
    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DomainEnums.UserStatus status;
    @Column(name = "session_version", nullable = false)
    private int sessionVersion;
    @Column(name = "created_at", nullable = false)
    private Instant createdAt;
    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    protected UserEntity() {}

    public UserEntity(String wxRefHash, String wxRefCipher, String nickname) {
        this.id = UuidV7.next();
        this.wxRefHash = wxRefHash;
        this.wxRefCipher = wxRefCipher;
        this.nickname = nickname;
        this.status = DomainEnums.UserStatus.ACTIVE;
        this.sessionVersion = 1;
        this.createdAt = Instant.now();
        this.updatedAt = createdAt;
    }

    @PreUpdate void touch() { updatedAt = Instant.now(); }
    public UUID getId() { return id; }
    public String getNickname() { return nickname; }
    public UUID getAvatarMediaId() { return avatarMediaId; }
    public String getWxRefHash() { return wxRefHash; }
    public DomainEnums.UserStatus getStatus() { return status; }
    public int getSessionVersion() { return sessionVersion; }
    public void setNickname(String nickname) { this.nickname = nickname; }
    public void setAvatarMediaId(UUID avatarMediaId) { this.avatarMediaId = avatarMediaId; }
    public void beginDeletion() {
        if (status != DomainEnums.UserStatus.DELETING) {
            status = DomainEnums.UserStatus.DELETING;
            sessionVersion += 1;
        }
    }
    public void completeDeletion(String anonymizedWxRefHash) {
        this.wxRefHash = anonymizedWxRefHash;
        this.wxRefCipher = null;
        this.nickname = "已注销用户";
        this.avatarMediaId = null;
        this.status = DomainEnums.UserStatus.DISABLED;
        this.sessionVersion += 1;
    }
}
