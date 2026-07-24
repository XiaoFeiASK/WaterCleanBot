-- 启用水面清理机器人平台所需的数据库扩展。
-- PostGIS 用于存储并查询机器人坐标、任务区域和告警位置。
CREATE EXTENSION IF NOT EXISTS postgis;

-- pgcrypto 提供 gen_random_uuid()，便于生成 UUID 主键。
CREATE EXTENSION IF NOT EXISTS pgcrypto;
