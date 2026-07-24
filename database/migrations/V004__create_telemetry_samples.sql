-- telemetry_samples 存储机器人上报的不可变历史遥测。
-- 数据量增长后，后续迁移可将此表改为按日或按月分区。
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

-- 此索引用于支持单台机器人的近期轨迹查询。
CREATE INDEX IF NOT EXISTS idx_telemetry_robot_reported ON telemetry_samples (robot_id, reported_at DESC);

-- 此索引用于支持地图距离和边界区域查询。
CREATE INDEX IF NOT EXISTS idx_telemetry_location ON telemetry_samples USING gist (location);
