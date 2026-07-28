<!-- 文件作用：说明 WaterCleanBot 项目目标、文件架构、开发边界和核心数据链路。 -->

# WaterCleanBot

WaterCleanBot 是水面垃圾清洁机器人的前后端与数据接入项目。当前阶段先搭建**清晰的工程骨架**，前端页面原型保持稳定，后端暂不深入实现业务接口，优先把目录职责、数据链路和后续扩展位置固定下来。

## 当前开发边界

- 前端：现有 `web/2026-07-10-11-51-01/` 页面基本定型，当前不改页面结构和交互内容。
- 后端：先保留 Go 服务骨架、包分层、模型和接口位置，不急着补完整 API 实现。
- 数据库：以 PostgreSQL + PostGIS 为主，迁移脚本先定义核心业务表、遥测表和最新状态表。
- 通信：机器人数据通过 MQTT 到达后端，由后端校验后写入 PostgreSQL，前端只通过 HTTP API 访问后端。

## 推荐文件架构

```text
WaterCleanBot/
├─ web/                              # 前端相关文件
│  ├─ 2026-07-10-11-51-01/            # 已定型的 HTML 高保真原型，暂不改页面
│  ├─ 2026-07-10-11-51-51-01/         # 前端原型辅助/烟测脚本
│  ├─ app/                            # 未来正式前端工程位置，如 Vue/React/Vite
│  └─ README.md                       # 前端目录说明
│
├─ cmd/
│  └─ watercleanbot/                  # Go 后端启动入口
│
├─ internal/                          # Go 后端内部包，不对外复用
│  ├─ api/                            # HTTP API 路由和 Handler 占位
│  ├─ auth/                           # 账号、角色、权限相关骨架
│  ├─ robot/                          # 机器人档案和状态业务骨架
│  ├─ mission/                        # 清洁任务、航点、执行记录骨架
│  ├─ waterarea/                      # 水域、边界、空间区域业务骨架
│  ├─ telemetry/                      # 遥测数据模型、校验、入库服务骨架
│  ├─ alarm/                          # 告警规则和告警事件业务骨架
│  ├─ command/                        # 命令下发和 ACK 状态业务骨架
│  ├─ mqtt/                           # MQTT 连接、订阅、Topic 规则骨架
│  ├─ db/                             # PostgreSQL/PostGIS 连接和迁移说明
│  ├─ config/                         # 环境变量和配置读取
│  └─ logger/                         # 日志初始化
│
├─ database/
│  ├─ migrations/                     # SQL 建表、索引、扩展迁移
│  ├─ seeds/                          # 开发测试种子数据
│  └─ queries/                        # 常用 SQL 查询草稿
│
├─ docker/                            # 本地中间件配置，如 Mosquitto
├─ docs/                              # 需求、架构、数据库、MQTT、API、部署文档
├─ scripts/                           # 本地迁移、种子、备份、恢复脚本
├─ test/                              # 测试说明和样例数据
├─ deploy/                            # 测试/生产部署模板
├─ docker-compose.yml                 # 本地 PostgreSQL/PostGIS + MQTT Broker
├─ .env.example                       # 环境变量模板，不保存真实密钥
└─ README.md                          # 当前项目总说明
```

## 核心数据链路

```text
机器人传感器
  -> 机器人程序组装 JSON
  -> MQTT 发布 v1/robots/{robotCode}/telemetry
  -> MQTT Broker 转发
  -> Go 后端订阅 v1/robots/+/telemetry
  -> 校验 robot_id / boot_id / seq_no / 时间 / 经纬度 / 电量
  -> PostgreSQL 事务
       1. 写入 telemetry_samples 历史遥测
       2. 更新 robot_shadow 最新状态
  -> 前端通过 HTTP API 查询机器人状态和轨迹
```

命令下发链路：

```text
前端管理页面
  -> Go 后端 HTTP API
  -> 写入 commands 命令记录
  -> MQTT 发布 v1/robots/{robotCode}/commands
  -> 机器人执行
  -> MQTT 发布 v1/robots/{robotCode}/acks
  -> 后端更新命令状态
```

## 本地开发

```powershell
copy .env.example .env
docker compose up -d
go run ./cmd/watercleanbot
```

健康检查：

```text
GET http://localhost:8080/health
```

## 后续实现顺序

1. 保持前端原型稳定，只在 `web/app/` 新建正式前端工程。
2. 后端先补 PostgreSQL 连接池和迁移执行方式。
3. 再补 MQTT 遥测订阅、JSON 校验和事务入库。
4. 最后补前端需要的查询 API、命令下发 API、权限和部署监控。
