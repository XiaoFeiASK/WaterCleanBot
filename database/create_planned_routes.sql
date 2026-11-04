-- 文件作用：创建规划航线和路径点表，用于替换前端航线规划假数据。

CREATE TABLE IF NOT EXISTS planned_routes (
  id BIGSERIAL PRIMARY KEY,
  robot_name TEXT NOT NULL,
  route_code TEXT NOT NULL,
  route_type TEXT NOT NULL DEFAULT '自定航线',
  coordinate_system TEXT NOT NULL DEFAULT 'GCJ02',
  length_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT planned_routes_robot_route_unique UNIQUE (robot_name, route_code),
  CONSTRAINT planned_routes_coordinate_system_check CHECK (coordinate_system IN ('GCJ02', 'WGS84')),
  CONSTRAINT planned_routes_length_meters_check CHECK (length_meters >= 0),
  CONSTRAINT planned_routes_duration_seconds_check CHECK (duration_seconds >= 0)
);

CREATE TABLE IF NOT EXISTS planned_route_points (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES planned_routes(id) ON DELETE CASCADE,
  point_seq INTEGER NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  speed_knots DOUBLE PRECISION NOT NULL,

  CONSTRAINT planned_route_points_route_seq_unique UNIQUE (route_id, point_seq),
  CONSTRAINT planned_route_points_lng_check CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT planned_route_points_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT planned_route_points_speed_knots_check CHECK (speed_knots > 0 AND speed_knots <= 100)
);

CREATE INDEX IF NOT EXISTS idx_planned_routes_robot_name_route_code
  ON planned_routes (robot_name, route_code);

CREATE INDEX IF NOT EXISTS idx_planned_route_points_route_id_seq
  ON planned_route_points (route_id, point_seq);

COMMENT ON TABLE planned_routes IS '规划航线主表：保存每台无人艇的真实航线记录。';
COMMENT ON COLUMN planned_routes.route_code IS '前端展示的航线编号，新航线使用上海本地时间戳，例如 20261104-153000.123456。';
COMMENT ON COLUMN planned_routes.coordinate_system IS '路径点坐标系：前端高德地图点默认为 GCJ02，下发艇端时可转换为 WGS84。';
COMMENT ON TABLE planned_route_points IS '规划航线路径点表：按 point_seq 保存经度、纬度和到该点速度。';
COMMENT ON COLUMN planned_route_points.speed_knots IS '到该点的速度，单位节。';
