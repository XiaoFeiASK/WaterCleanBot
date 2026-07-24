-- commands stores control commands requested by users or backend automation.
CREATE TABLE IF NOT EXISTS commands (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    robot_id uuid NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    type text NOT NULL,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    status text NOT NULL DEFAULT 'pending',
    requested_by text,
    expires_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

-- command_acks stores acknowledgement messages returned by robots.
CREATE TABLE IF NOT EXISTS command_acks (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    command_id uuid NOT NULL REFERENCES commands(id) ON DELETE CASCADE,
    robot_id uuid NOT NULL REFERENCES robots(id) ON DELETE CASCADE,
    status text NOT NULL,
    message text,
    received_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_commands_robot_created ON commands (robot_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_commands_status ON commands (status);
CREATE INDEX IF NOT EXISTS idx_command_acks_command_id ON command_acks (command_id);
