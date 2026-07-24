-- robots stores the backend record for each physical cleaning robot.
CREATE TABLE IF NOT EXISTS robots (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text NOT NULL UNIQUE,
    model text NOT NULL DEFAULT 'unknown',
    status text NOT NULL DEFAULT 'inactive',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- Robot status is frequently used by dashboard filters.
CREATE INDEX IF NOT EXISTS idx_robots_status ON robots (status);
