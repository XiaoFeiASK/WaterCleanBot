-- 文件作用：创建机器人最新状态表，用于后台快速读取。

-- robot_shadow 存储每台机器人的最新已知状态。
-- 它应与插入 telemetry_samples 在同一个事务中更新。
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
