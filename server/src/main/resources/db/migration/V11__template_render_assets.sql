ALTER TABLE derived_asset ADD COLUMN source_asset_ids VARCHAR(400) NULL;
ALTER TABLE derived_asset ADD COLUMN rendered_media_asset_id BINARY(16) NULL;
ALTER TABLE derived_asset ADD COLUMN template_id VARCHAR(60) NULL;
ALTER TABLE derived_asset ADD COLUMN template_version INT NULL;
ALTER TABLE derived_asset ADD COLUMN render_config VARCHAR(2000) NULL;
CREATE UNIQUE INDEX uk_derived_rendered_media_asset ON derived_asset(rendered_media_asset_id);
