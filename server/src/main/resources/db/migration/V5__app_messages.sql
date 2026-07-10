CREATE TABLE app_message (
    id BINARY(16) PRIMARY KEY,
    recipient_id BINARY(16) NOT NULL,
    actor_id BINARY(16) NULL,
    couple_id BINARY(16) NULL,
    moment_id BINARY(16) NULL,
    message_type VARCHAR(20) NOT NULL,
    title VARCHAR(80) NOT NULL,
    summary VARCHAR(240) NOT NULL,
    read_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_app_message_recipient FOREIGN KEY (recipient_id) REFERENCES app_user(id),
    CONSTRAINT fk_app_message_actor FOREIGN KEY (actor_id) REFERENCES app_user(id),
    CONSTRAINT fk_app_message_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id),
    CONSTRAINT fk_app_message_moment FOREIGN KEY (moment_id) REFERENCES moment(id)
);
CREATE INDEX idx_app_message_recipient_time ON app_message(recipient_id, created_at, id);
CREATE INDEX idx_app_message_recipient_unread ON app_message(recipient_id, read_at, created_at);
