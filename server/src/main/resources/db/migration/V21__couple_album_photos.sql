ALTER TABLE media_asset ADD COLUMN album_couple_id BINARY(16) NULL;
ALTER TABLE media_asset ADD CONSTRAINT fk_media_album_couple
    FOREIGN KEY (album_couple_id) REFERENCES couple_space(id);
CREATE INDEX idx_media_album ON media_asset(album_couple_id, status, created_at);
