ALTER TABLE media_asset ADD COLUMN processing_job_id VARCHAR(100) NULL AFTER etag;
CREATE INDEX idx_media_processing ON media_asset(status, updated_at);
