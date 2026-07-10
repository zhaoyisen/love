CREATE TABLE derived_asset (
    id BINARY(16) PRIMARY KEY,
    owner_id BINARY(16) NOT NULL,
    source_type VARCHAR(40) NOT NULL,
    source_id BINARY(16) NULL,
    storage_key VARCHAR(300) NOT NULL,
    status VARCHAR(20) NOT NULL,
    failure_reason VARCHAR(240) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_derived_asset_storage_key UNIQUE (storage_key),
    CONSTRAINT fk_derived_asset_owner FOREIGN KEY (owner_id) REFERENCES app_user(id)
);
CREATE INDEX idx_derived_owner_status ON derived_asset(owner_id, status, created_at);
CREATE INDEX idx_derived_source ON derived_asset(source_type, source_id, status);

ALTER TABLE deletion_request ADD COLUMN processed_derived_assets INT NOT NULL DEFAULT 0;
