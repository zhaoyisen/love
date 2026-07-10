CREATE TABLE annual_recap (
    id BINARY(16) PRIMARY KEY,
    couple_id BINARY(16) NOT NULL,
    recap_year INT NOT NULL,
    title VARCHAR(30) NOT NULL,
    status VARCHAR(10) NOT NULL,
    version INT NOT NULL,
    generated_at DATETIME(3) NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_annual_recap_couple_year UNIQUE (couple_id, recap_year),
    CONSTRAINT fk_annual_recap_couple FOREIGN KEY (couple_id) REFERENCES couple_space(id)
);

CREATE TABLE annual_recap_moment (
    id BINARY(16) PRIMARY KEY,
    recap_id BINARY(16) NOT NULL,
    moment_id BINARY(16) NOT NULL,
    sort_order INT NOT NULL,
    CONSTRAINT uk_annual_recap_moment UNIQUE (recap_id, moment_id),
    CONSTRAINT fk_annual_recap_moment_recap FOREIGN KEY (recap_id) REFERENCES annual_recap(id),
    CONSTRAINT fk_annual_recap_moment_moment FOREIGN KEY (moment_id) REFERENCES moment(id)
);
CREATE INDEX idx_annual_recap_moment_order ON annual_recap_moment(recap_id, sort_order);
