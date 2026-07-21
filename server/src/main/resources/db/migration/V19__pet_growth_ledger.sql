CREATE TABLE pet_growth_ledger (
    id BINARY(16) PRIMARY KEY,
    pet_id BINARY(16) NOT NULL,
    couple_id BINARY(16) NOT NULL,
    actor_id BINARY(16) NOT NULL,
    source_type VARCHAR(30) NOT NULL,
    source_id BINARY(16) NOT NULL,
    rule_version INT NOT NULL,
    action_date DATE NOT NULL,
    delta INT NOT NULL,
    reversed_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_pet_growth_source UNIQUE (pet_id, source_type, source_id, rule_version),
    CONSTRAINT fk_pet_growth_pet FOREIGN KEY (pet_id) REFERENCES pet_state(id),
    CONSTRAINT fk_pet_growth_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id),
    CONSTRAINT fk_pet_growth_actor FOREIGN KEY (actor_id) REFERENCES app_user(id),
    INDEX idx_pet_growth_daily (couple_id, action_date, reversed_at),
    INDEX idx_pet_growth_log (pet_id, created_at)
);
