CREATE TABLE app_user (
    id BINARY(16) PRIMARY KEY,
    wx_ref_hash VARCHAR(64) NOT NULL,
    wx_ref_cipher VARCHAR(512) NULL,
    nickname VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    session_version INT NOT NULL DEFAULT 1,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_user_wx_ref_hash UNIQUE (wx_ref_hash)
);

CREATE TABLE couple_space (
    id BINARY(16) PRIMARY KEY,
    member_a_id BINARY(16) NOT NULL,
    member_b_id BINARY(16) NOT NULL,
    status VARCHAR(20) NOT NULL,
    relationship_name VARCHAR(40) NULL,
    anniversary DATE NULL,
    version INT NOT NULL DEFAULT 0,
    ended_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
);
CREATE INDEX idx_couple_status_version ON couple_space(status, version);
CREATE INDEX idx_couple_pair ON couple_space(member_a_id, member_b_id, created_at);

CREATE TABLE active_couple_member (
    user_id BINARY(16) PRIMARY KEY,
    couple_id BINARY(16) NOT NULL,
    joined_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_active_member_user FOREIGN KEY (user_id) REFERENCES app_user(id),
    CONSTRAINT fk_active_member_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id)
);
CREATE INDEX idx_active_member_couple ON active_couple_member(couple_id, user_id);

CREATE TABLE invitation (
    id BINARY(16) PRIMARY KEY,
    inviter_id BINARY(16) NOT NULL,
    token_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    accepted_by BINARY(16) NULL,
    version INT NOT NULL DEFAULT 0,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_invitation_token_hash UNIQUE (token_hash),
    CONSTRAINT fk_invitation_inviter FOREIGN KEY (inviter_id) REFERENCES app_user(id)
);
CREATE INDEX idx_invitation_inviter_status_expiry ON invitation(inviter_id, status, expires_at);

CREATE TABLE moment (
    id BINARY(16) PRIMARY KEY,
    author_id BINARY(16) NOT NULL,
    couple_id BINARY(16) NULL,
    type VARCHAR(10) NOT NULL,
    title VARCHAR(30) NULL,
    body VARCHAR(1000) NOT NULL,
    occurred_at DATETIME(3) NOT NULL,
    visibility VARCHAR(10) NOT NULL,
    status VARCHAR(24) NOT NULL,
    version INT NOT NULL DEFAULT 0,
    deleted_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_moment_author FOREIGN KEY (author_id) REFERENCES app_user(id),
    CONSTRAINT fk_moment_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id)
);
CREATE INDEX idx_moment_author_timeline ON moment(author_id, status, occurred_at, created_at, id);
CREATE INDEX idx_moment_couple_timeline ON moment(couple_id, visibility, status, occurred_at, created_at, id);

CREATE TABLE moment_tag (
    moment_id BINARY(16) NOT NULL,
    tag_type VARCHAR(10) NOT NULL,
    tag_value VARCHAR(30) NOT NULL,
    PRIMARY KEY (moment_id, tag_type, tag_value),
    CONSTRAINT fk_moment_tag_moment FOREIGN KEY (moment_id) REFERENCES moment(id)
);

CREATE TABLE media_asset (
    id BINARY(16) PRIMARY KEY,
    uploader_id BINARY(16) NOT NULL,
    moment_id BINARY(16) NULL,
    kind VARCHAR(10) NOT NULL,
    storage_key VARCHAR(300) NOT NULL,
    sha256 VARCHAR(64) NULL,
    mime_type VARCHAR(100) NOT NULL,
    size_bytes BIGINT NOT NULL,
    etag VARCHAR(100) NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_media_storage_key UNIQUE (storage_key),
    CONSTRAINT fk_media_uploader FOREIGN KEY (uploader_id) REFERENCES app_user(id),
    CONSTRAINT fk_media_moment FOREIGN KEY (moment_id) REFERENCES moment(id)
);
CREATE INDEX idx_media_moment_status ON media_asset(moment_id, status);
CREATE INDEX idx_media_uploader_time ON media_asset(uploader_id, created_at);

CREATE TABLE upload_session (
    id BINARY(16) PRIMARY KEY,
    asset_id BINARY(16) NOT NULL,
    user_id BINARY(16) NOT NULL,
    expires_at DATETIME(3) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_upload_asset UNIQUE (asset_id),
    CONSTRAINT fk_upload_asset FOREIGN KEY (asset_id) REFERENCES media_asset(id),
    CONSTRAINT fk_upload_user FOREIGN KEY (user_id) REFERENCES app_user(id)
);
CREATE INDEX idx_upload_user_status ON upload_session(user_id, status, expires_at);
