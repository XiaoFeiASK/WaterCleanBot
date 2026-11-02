-- +goose Up
ALTER TABLE users ALTER COLUMN username TYPE TEXT;

-- +goose Down
ALTER TABLE users ALTER COLUMN username TYPE VARCHAR(32);
