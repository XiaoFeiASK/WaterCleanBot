-- +goose Up
ALTER TABLE planned_routes
  ALTER COLUMN route_code TYPE TEXT;

CREATE TABLE IF NOT EXISTS robot_route_tracking_stats (
  robot_name TEXT NOT NULL,
  route_key TEXT NOT NULL,
  route_name TEXT NOT NULL,
  battery_consumed_percent DOUBLE PRECISION,
  battery_start_percent DOUBLE PRECISION,
  tracking_active BOOLEAN NOT NULL DEFAULT false,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (robot_name, route_key),
  CONSTRAINT robot_route_tracking_stats_battery_check
    CHECK (battery_consumed_percent IS NULL OR battery_consumed_percent >= 0),
  CONSTRAINT robot_route_tracking_stats_start_battery_check
    CHECK (battery_start_percent IS NULL OR battery_start_percent BETWEEN 0 AND 100)
);

COMMENT ON TABLE robot_route_tracking_stats IS
  '按设备和航线保存最近一次循迹的真实电量消耗与开始、结束时间。';

-- +goose Down
DROP TABLE IF EXISTS robot_route_tracking_stats;
