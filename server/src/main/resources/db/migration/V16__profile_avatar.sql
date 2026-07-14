ALTER TABLE media_asset
    ADD COLUMN profile_avatar BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE app_user
    ADD COLUMN avatar_media_id BINARY(16) NULL;

ALTER TABLE app_user
    ADD CONSTRAINT fk_user_avatar_media
        FOREIGN KEY (avatar_media_id) REFERENCES media_asset(id);

CREATE INDEX idx_media_profile_avatar ON media_asset(profile_avatar, status, created_at);
