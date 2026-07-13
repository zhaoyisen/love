ALTER TABLE pet_state ADD COLUMN last_renamed_at DATETIME(3) NULL;

CREATE TABLE pet_adoption_proposal (
    id BINARY(16) PRIMARY KEY,
    couple_id BINARY(16) NOT NULL,
    proposer_id BINARY(16) NOT NULL,
    kind VARCHAR(30) NOT NULL,
    name VARCHAR(30) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_pet_adoption_couple UNIQUE (couple_id),
    CONSTRAINT fk_pet_adoption_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id),
    CONSTRAINT fk_pet_adoption_proposer FOREIGN KEY (proposer_id) REFERENCES app_user(id)
);
