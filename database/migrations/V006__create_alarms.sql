-- alarms stores robot, mission, and device fault events.
CREATE TABLE IF NOT EXISTS alarms (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_id uuid REFERENCES robots(id) ON DELETE SET NULL,
    mission_id uuid REFERENCES missions(id) ON DELETE SET NULL,
    level text NOT NULL DEFAULT 'warning',
    type text NOT NULL,
    message text NOT NULL,
    location geography(Point, 4326),
    status text NOT NULL DEFAULT 'open',
    raised_at timestamptz NOT NULL DEFAULT now(),
    resolved_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_alarms_robot_raised ON alarms (robot_id, raised_at DESC);
CREATE INDEX IF NOT EXISTS idx_alarms_status ON alarms (status);
CREATE INDEX IF NOT EXISTS idx_alarms_location ON alarms USING gist (location);
