CREATE TABLE audit_log (
    id BINARY(16) PRIMARY KEY,
    actor_id BINARY(16) NULL,
    couple_id BINARY(16) NULL,
    resource_type VARCHAR(40) NOT NULL,
    resource_id BINARY(16) NULL,
    action VARCHAR(60) NOT NULL,
    result VARCHAR(20) NOT NULL,
    reason VARCHAR(240) NULL,
    request_id VARCHAR(80) NULL,
    metadata_json TEXT NULL,
    created_at DATETIME(3) NOT NULL
);
CREATE INDEX idx_audit_actor_time ON audit_log(actor_id, created_at, id);
CREATE INDEX idx_audit_action_time ON audit_log(action, created_at, id);
CREATE INDEX idx_audit_resource ON audit_log(resource_type, resource_id, created_at);

CREATE TABLE content_feedback (
    id BINARY(16) PRIMARY KEY,
    reporter_id BINARY(16) NOT NULL,
    couple_id BINARY(16) NULL,
    resource_type VARCHAR(40) NOT NULL,
    resource_id BINARY(16) NULL,
    category VARCHAR(30) NOT NULL,
    description VARCHAR(500) NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL
);
CREATE INDEX idx_feedback_reporter_time ON content_feedback(reporter_id, created_at, id);
CREATE INDEX idx_feedback_resource ON content_feedback(resource_type, resource_id, created_at);
CREATE INDEX idx_feedback_status_time ON content_feedback(status, created_at, id);

CREATE TABLE deletion_request (
    id BINARY(16) PRIMARY KEY,
    requester_id BINARY(16) NOT NULL,
    request_type VARCHAR(30) NOT NULL,
    status VARCHAR(20) NOT NULL,
    reason VARCHAR(200) NULL,
    status_token_hash VARCHAR(64) NOT NULL,
    requested_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    completed_at DATETIME(3) NULL
);
CREATE INDEX idx_deletion_requester_time ON deletion_request(requester_id, requested_at, id);
CREATE INDEX idx_deletion_status_time ON deletion_request(status, requested_at, id);
