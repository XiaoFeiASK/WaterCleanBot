-- 文件作用：插入一条机器人当前位置测试数据，方便本地接口联调。

-- 与早期 task.go 中的演示数据保持一致。
-- 可重复执行：同名机器人已存在时，会覆盖为最新测试位置。
INSERT INTO robot_current_locations (
  robot_name,
  lat,
  lng,
  heading,
  speed,
  battery,
  status,
  source_timestamp_ms
)
VALUES (
  '清澜一号',
  31.07,
  120.88,
  135.0,
  2.3,
  68.0,
  1,
  1750000000000
)
ON CONFLICT (robot_name) DO UPDATE SET
  lat = EXCLUDED.lat,
  lng = EXCLUDED.lng,
  heading = EXCLUDED.heading,
  speed = EXCLUDED.speed,
  battery = EXCLUDED.battery,
  status = EXCLUDED.status,
  source_timestamp_ms = EXCLUDED.source_timestamp_ms,
  updated_at = now();
