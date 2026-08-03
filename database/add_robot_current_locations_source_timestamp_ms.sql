-- 文件作用：给已存在的机器人当前位置表补充 MQTT 遥测原始时间戳字段。

ALTER TABLE robot_current_locations
  ADD COLUMN IF NOT EXISTS source_timestamp_ms BIGINT;

ALTER TABLE robot_current_locations
  DROP CONSTRAINT IF EXISTS robot_current_locations_source_timestamp_ms_check;

ALTER TABLE robot_current_locations
  ADD CONSTRAINT robot_current_locations_source_timestamp_ms_check
  CHECK (source_timestamp_ms IS NULL OR source_timestamp_ms > 0);

COMMENT ON COLUMN robot_current_locations.source_timestamp_ms IS '无人艇 MQTT 遥测报文中的原始毫秒时间戳，用于避免旧消息覆盖新位置。';
