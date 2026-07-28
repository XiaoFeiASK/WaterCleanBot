<!-- 文件作用：记录 PostgreSQL/PostGIS 表设计原则和核心表职责。 -->

# 数据库设计

本文档描述首版数据库模型。

## 核心表

- `robots`：实体机器人记录。
- `missions`：计划清洁任务。
- `mission_waypoints`：计划任务路径点。
- `mission_runs`：任务实际执行记录。
- `telemetry_samples`：历史遥测记录。
- `robot_shadow`：每台机器人的最新状态。
- `alarms`：机器人和任务告警。
- `commands`：后端发送给机器人的命令。

## 设计规则

- 后端记录使用 UUID 主键。
- 使用唯一机器人编码，例如 `H20-001`。
- 位置字段使用 PostGIS 点列。
- 使用 `robot_id + boot_id + seq_no` 保证遥测幂等。
- 在同一个事务中插入遥测历史并更新 `robot_shadow`。
- 为 `(robot_id, reported_at DESC)` 和空间查询添加索引。
