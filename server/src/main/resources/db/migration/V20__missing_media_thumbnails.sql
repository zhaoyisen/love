CREATE INDEX idx_media_missing_thumbnail ON media_asset(status, thumbnail_storage_key, updated_at);
