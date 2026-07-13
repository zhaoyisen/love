ALTER TABLE deletion_request ADD COLUMN processed_moments INT NOT NULL DEFAULT 0;
ALTER TABLE deletion_request ADD COLUMN processed_media_assets INT NOT NULL DEFAULT 0;
ALTER TABLE deletion_request ADD COLUMN processed_comments INT NOT NULL DEFAULT 0;
ALTER TABLE deletion_request ADD COLUMN processed_reactions INT NOT NULL DEFAULT 0;
ALTER TABLE deletion_request ADD COLUMN failure_reason VARCHAR(240) NULL;
