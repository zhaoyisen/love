CREATE TABLE pet_state (
    id BINARY(16) PRIMARY KEY,
    couple_id BINARY(16) NOT NULL,
    name VARCHAR(30) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    level INT NOT NULL,
    growth INT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_pet_state_couple UNIQUE (couple_id),
    CONSTRAINT fk_pet_state_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id)
);

CREATE TABLE pet_action_log (
    id BINARY(16) PRIMARY KEY,
    pet_id BINARY(16) NOT NULL,
    couple_id BINARY(16) NOT NULL,
    actor_id BINARY(16) NOT NULL,
    action_type VARCHAR(10) NOT NULL,
    action_date DATE NOT NULL,
    growth_delta INT NOT NULL,
    created_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_pet_daily_action UNIQUE (couple_id, actor_id, action_type, action_date),
    CONSTRAINT fk_pet_action_pet FOREIGN KEY (pet_id) REFERENCES pet_state(id),
    CONSTRAINT fk_pet_action_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id),
    CONSTRAINT fk_pet_action_actor FOREIGN KEY (actor_id) REFERENCES app_user(id)
);
CREATE INDEX idx_pet_action_pet_time ON pet_action_log(pet_id, created_at, id);
CREATE INDEX idx_pet_action_actor_date ON pet_action_log(actor_id, action_date);
