# WaterCleanBot

WaterCleanBot 是一个用于水面垃圾清理机器人平台的后端模板。

首个后端里程碑刻意保持小范围：

- 启动 Go HTTP 服务。
- 在本地启动带 PostGIS 的 PostgreSQL。
- 为机器人、任务、遥测和当前机器人状态定义数据库迁移。
- 在后续步骤中通过 MQTT 接收机器人遥测。
- 将历史遥测存储到 `telemetry_samples`。
- 更新 `robot_shadow` 中的最新机器人状态。

## 架构

```text
机器人
  -> MQTT 消息代理
  -> Go 后端服务
  -> PostgreSQL + PostGIS
  -> 管理看板 API
```

机器人不应直接连接 PostgreSQL。后端服务负责校验消息、应用幂等规则，并通过 SQL 事务写入数据。

## 仓库结构

```text
cmd/                  应用程序入口。
internal/             该后端服务的私有 Go 包。
database/migrations/  带版本号的 SQL 迁移文件。
database/seeds/       仅用于开发的种子数据。
docs/                 需求、架构、MQTT、API 和部署说明。
scripts/              数据库和部署工作的本地辅助脚本。
test/                 集成测试夹具和未来测试包。
deploy/               预发和生产部署模板。
```

## 本地开发

```powershell
copy .env.example .env
docker compose up -d
go run ./cmd/watercleanbot
```

服务启动后提供基础健康检查端点：

```text
GET http://localhost:8080/health
```

## 当前状态

当前仓库是一个脚手架。文件中的注释说明了项目各部分的归属以及下一步应实现的内容。
