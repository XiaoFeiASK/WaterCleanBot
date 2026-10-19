-- +goose Up
CREATE TABLE public_shoreline (
    id SMALLINT PRIMARY KEY CHECK (id = 1),
    revision TEXT NOT NULL,
    files JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    uploaded_by_id TEXT NOT NULL,
    uploaded_by_name TEXT NOT NULL
);

-- +goose Down
DROP TABLE public_shoreline;
