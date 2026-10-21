ALTER TABLE moment ADD COLUMN admin_hidden BOOLEAN NOT NULL DEFAULT FALSE;
CREATE INDEX idx_moment_admin_account ON moment(author_id, admin_hidden, occurred_at);

CREATE TABLE media_object_history (
    asset_id BINARY(16) NOT NULL,
    storage_key VARCHAR(300) NOT NULL,
    PRIMARY KEY(asset_id, storage_key),
    CONSTRAINT fk_media_object_history FOREIGN KEY(asset_id) REFERENCES media_asset(id) ON DELETE CASCADE
);

CREATE TABLE admin_media_check (
    asset_id BINARY(16) PRIMARY KEY,
    source_key VARCHAR(300) NOT NULL,
    display_key VARCHAR(300),
    thumbnail_key VARCHAR(300),
    source_state VARCHAR(20) NOT NULL,
    display_state VARCHAR(20) NOT NULL,
    thumbnail_state VARCHAR(20) NOT NULL,
    checked_at DATETIME(3) NOT NULL
);

CREATE TABLE admin_media_task (
    id BINARY(16) PRIMARY KEY,
    account_id BINARY(16) NOT NULL,
    action VARCHAR(20) NOT NULL,
    operator_name VARCHAR(60) NOT NULL,
    selection_hash VARCHAR(64) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    INDEX idx_admin_task_account (account_id, created_at)
);
CREATE TABLE admin_media_task_item (
    id BINARY(16) PRIMARY KEY,
    task_id BINARY(16) NOT NULL,
    asset_id BINARY(16) NOT NULL,
    moment_id BINARY(16) NOT NULL,
    status VARCHAR(20) NOT NULL,
    message VARCHAR(240),
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_admin_task_item FOREIGN KEY(task_id) REFERENCES admin_media_task(id),
    CONSTRAINT uk_admin_task_asset UNIQUE(task_id, asset_id),
    INDEX idx_admin_item_pending (status, updated_at)
);
