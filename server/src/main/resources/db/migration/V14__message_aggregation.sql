ALTER TABLE app_message ADD COLUMN aggregate_key VARCHAR(180) NULL;
ALTER TABLE app_message ADD COLUMN aggregate_count INT NOT NULL DEFAULT 1;
ALTER TABLE app_message ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3);
CREATE INDEX idx_app_message_aggregate ON app_message(recipient_id, aggregate_key);
CREATE TABLE app_message_source (id BINARY(16) PRIMARY KEY,message_id BINARY(16) NOT NULL,source_id BINARY(16) NOT NULL,CONSTRAINT uk_app_message_source UNIQUE(message_id,source_id),CONSTRAINT fk_app_message_source_message FOREIGN KEY(message_id) REFERENCES app_message(id));
