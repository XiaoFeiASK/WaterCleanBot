-- robot_shadow stores the latest known state for each robot.
-- It should be updated in the same transaction that inserts telemetry_samples.
CREATE TABLE IF NOT EXISTS robot_shadow (
    robot_id uuid PRIMARY KEY REFERENCES robots(id) ON DELETE CASCADE,
    last_telemetry_id uuid REFERENCES telemetry_samples(id) ON DELETE SET NULL,
    last_reported_at timestamptz NOT NULL,
    location geography(Point, 4326) NOT NULL,
    battery_percent numeric(5,2),
    speed_mps numeric(8,3),
    trash_weight_kg numeric(10,3),
    sensor_data jsonb NOT NULL DEFAULT '{}'::jsonb,
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_robot_shadow_location ON robot_shadow USING gist (location);
CREATE INDEX IF NOT EXISTS idx_robot_shadow_last_reported ON robot_shadow (last_reported_at DESC);
