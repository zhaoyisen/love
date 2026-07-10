CREATE TABLE moment_reaction (
    id BINARY(16) PRIMARY KEY,
    moment_id BINARY(16) NOT NULL,
    actor_id BINARY(16) NOT NULL,
    reaction_value VARCHAR(20) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    updated_at DATETIME(3) NOT NULL,
    CONSTRAINT uk_moment_reaction_actor UNIQUE (moment_id, actor_id),
    CONSTRAINT fk_moment_reaction_moment FOREIGN KEY (moment_id) REFERENCES moment(id),
    CONSTRAINT fk_moment_reaction_actor FOREIGN KEY (actor_id) REFERENCES app_user(id)
);
CREATE INDEX idx_moment_reaction_actor ON moment_reaction(actor_id, updated_at);

CREATE TABLE moment_comment (
    id BINARY(16) PRIMARY KEY,
    moment_id BINARY(16) NOT NULL,
    author_id BINARY(16) NOT NULL,
    body VARCHAR(300) NOT NULL,
    created_at DATETIME(3) NOT NULL,
    CONSTRAINT fk_moment_comment_moment FOREIGN KEY (moment_id) REFERENCES moment(id),
    CONSTRAINT fk_moment_comment_author FOREIGN KEY (author_id) REFERENCES app_user(id)
);
CREATE INDEX idx_moment_comment_moment_time ON moment_comment(moment_id, created_at, id);
CREATE INDEX idx_moment_comment_author_time ON moment_comment(author_id, created_at);
