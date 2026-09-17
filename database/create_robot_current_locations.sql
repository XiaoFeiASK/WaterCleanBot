-- 文件作用：创建机器人当前位置表，仅保存每台机器人的最新一条位置数据。

-- 一台机器人只保留一行当前位置；后续新位置使用 robot_name 覆盖更新。
CREATE TABLE IF NOT EXISTS robot_current_locations (
  robot_name TEXT PRIMARY KEY,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  heading DOUBLE PRECISION,
  speed DOUBLE PRECISION,
  battery DOUBLE PRECISION,
  status INTEGER NOT NULL,
  source_timestamp_ms BIGINT,
  geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (
    ST_SetSRID(ST_MakePoint(lng, lat), 4326)
  ) STORED,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT robot_current_locations_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT robot_current_locations_lng_check CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT robot_current_locations_heading_check CHECK (heading >= 0 AND heading <= 360),
  CONSTRAINT robot_current_locations_speed_check CHECK (speed >= 0),
  CONSTRAINT robot_current_locations_battery_check CHECK (battery >= 0 AND battery <= 100),
  CONSTRAINT robot_current_locations_status_check CHECK (status >= 0),
  CONSTRAINT robot_current_locations_source_timestamp_ms_check CHECK (source_timestamp_ms IS NULL OR source_timestamp_ms > 0)
);

-- Existing installations: allow registration before telemetry is received.
ALTER TABLE robot_current_locations
  ALTER COLUMN lat DROP NOT NULL,
  ALTER COLUMN lng DROP NOT NULL,
  ALTER COLUMN heading DROP NOT NULL,
  ALTER COLUMN speed DROP NOT NULL,
  ALTER COLUMN battery DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_robot_current_locations_geom
  ON robot_current_locations USING GIST (geom);

COMMENT ON TABLE robot_current_locations IS '机器人当前位置表：每台机器人只保留最新一条位置数据，不保存历史轨迹。';
COMMENT ON COLUMN robot_current_locations.robot_name IS '机器人名称，对应接口字段 robotName。';
COMMENT ON COLUMN robot_current_locations.lat IS '纬度，对应接口字段 lat。';
COMMENT ON COLUMN robot_current_locations.lng IS '经度，对应接口字段 lng。';
COMMENT ON COLUMN robot_current_locations.heading IS '航向角，单位为度，对应接口字段 heading。';
COMMENT ON COLUMN robot_current_locations.speed IS '当前速度，对应接口字段 speed。';
COMMENT ON COLUMN robot_current_locations.battery IS '电量百分比，对应接口字段 battery。';
COMMENT ON COLUMN robot_current_locations.status IS '机器人状态码，对应接口字段 status。';
COMMENT ON COLUMN robot_current_locations.source_timestamp_ms IS '位置来源时间戳：优先保留 MQTT 设备时间，导航反馈无设备时间时使用服务端接收时间。';
COMMENT ON COLUMN robot_current_locations.geom IS '由 lng/lat 自动生成的 PostGIS 点位，SRID 4326。';
COMMENT ON COLUMN robot_current_locations.updated_at IS '当前位置最后更新时间。';
