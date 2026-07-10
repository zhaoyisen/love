CREATE TABLE notification_preference (
    user_id BINARY(16) PRIMARY KEY,
    moment_notice BOOLEAN NOT NULL DEFAULT TRUE,
    reaction_notice BOOLEAN NOT NULL DEFAULT TRUE,
    pet_notice BOOLEAN NOT NULL DEFAULT TRUE,
    recap_notice BOOLEAN NOT NULL DEFAULT TRUE,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_notification_preference_user FOREIGN KEY (user_id) REFERENCES app_user(id)
);
