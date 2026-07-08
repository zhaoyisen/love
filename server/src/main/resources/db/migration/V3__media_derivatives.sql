ALTER TABLE media_asset ADD COLUMN display_storage_key VARCHAR(300) NULL AFTER processing_job_id;
ALTER TABLE media_asset ADD COLUMN thumbnail_storage_key VARCHAR(300) NULL AFTER display_storage_key;
CREATE INDEX idx_media_orphan_cleanup ON media_asset(moment_id, status, created_at);
CREATE INDEX idx_moment_trash_cleanup ON moment(status, deleted_at);
