-- missions stores planned cleaning work assigned to robots.
CREATE TABLE IF NOT EXISTS missions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_id uuid REFERENCES robots(id) ON DELETE SET NULL,
    name text NOT NULL,
    status text NOT NULL DEFAULT 'planned',
    planned_start_at timestamptz,
    planned_end_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- mission_waypoints stores the planned path for a mission.
CREATE TABLE IF NOT EXISTS mission_waypoints (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    sequence_no integer NOT NULL,
    location geography(Point, 4326) NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (mission_id, sequence_no)
);

-- mission_runs stores actual mission execution attempts.
CREATE TABLE IF NOT EXISTS mission_runs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    mission_id uuid NOT NULL REFERENCES missions(id) ON DELETE CASCADE,
    robot_id uuid NOT NULL REFERENCES robots(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'running',
    started_at timestamptz NOT NULL DEFAULT now(),
    ended_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missions_robot_id ON missions (robot_id);
CREATE INDEX IF NOT EXISTS idx_mission_waypoints_location ON mission_waypoints USING gist (location);
CREATE INDEX IF NOT EXISTS idx_mission_runs_robot_started ON mission_runs (robot_id, started_at DESC);
