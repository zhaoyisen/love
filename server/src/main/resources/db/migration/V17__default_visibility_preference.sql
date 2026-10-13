ALTER TABLE notification_preference
    ADD COLUMN default_visibility VARCHAR(20) NOT NULL DEFAULT 'PRIVATE';
