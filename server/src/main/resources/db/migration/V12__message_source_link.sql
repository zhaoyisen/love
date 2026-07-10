ALTER TABLE app_message ADD COLUMN source_id BINARY(16) NULL;
CREATE INDEX idx_app_message_source ON app_message(moment_id, actor_id, message_type, source_id);
