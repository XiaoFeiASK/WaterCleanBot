-- +goose Up
CREATE TABLE IF NOT EXISTS robot_distance_totals (
    robot_name TEXT PRIMARY KEY,
    last_distance_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_distance_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT robot_distance_totals_last_check CHECK (last_distance_meters >= 0),
    CONSTRAINT robot_distance_totals_total_check CHECK (total_distance_meters >= 0)
);

-- +goose Down
DROP TABLE IF EXISTS robot_distance_totals;
