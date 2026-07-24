-- telemetry_samples stores immutable historical telemetry reported by robots.
-- A later migration can convert this table to daily or monthly partitions when volume grows.
CREATE TABLE IF NOT EXISTS telemetry_samples (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_id uuid NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    boot_id uuid NOT NULL,
    seq_no bigint NOT NULL,
    reported_at timestamptz NOT NULL,
    location geography(Point, 4326) NOT NULL,
    battery_percent numeric(5,2),
    speed_mps numeric(8,3),
    trash_weight_kg numeric(10,3),
    sensor_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    received_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (robot_id, boot_id, seq_no)
);

-- This index supports recent-track queries for one robot.
CREATE INDEX IF NOT EXISTS idx_telemetry_robot_reported ON telemetry_samples (robot_id, reported_at DESC);

-- This index supports map distance and bounding-area queries.
CREATE INDEX IF NOT EXISTS idx_telemetry_location ON telemetry_samples USING gist (location);
