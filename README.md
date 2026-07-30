<!-- 文件作用：说明 WaterCleanBot 当前最小后端范围、文件架构和实时定位链路。 -->

# WaterCleanBot

WaterCleanBot 是水面垃圾清洁机器人项目。当前后端阶段先保持极简：**只暴露一个接口，只运行一个任务，目标是实时定位机器人位置**。

前端页面原型已经基本定型，仍保留在 `web/1/`，当前不改页面结构和交互内容。

## 当前后端范围

当前后端只做一件事：

```text
后台实时定位任务
  -> 维护机器人最新位置
  -> HTTP 接口查询机器人最新位置
```

当前位置接口：

```text
GET /api/robots/locations
GET /api/robots/{robotName}/location
```

示例：

```text
GET http://localhost:8080/api/robots/清澜一号/location
```

## 当前文件架构

```text
WaterCleanBot/
├─ cmd/
│  └─ watercleanbot/
│     └─ main.go                    # 后端启动入口
│
├─ internal/
│  ├─ api/
│  │  ├─ router.go                  # 注册实时定位接口
│  │  └─ location_handler.go        # 返回机器人最新位置
│  │
│  ├─ config/
│  │  └─ config.go                  # 读取 HTTP 端口、环境、定位任务间隔
│  │
│  ├─ location/
│  │  ├─ model.go                   # 实时位置数据结构
│  │  ├─ store.go                   # 内存保存机器人最新位置
│  │  └─ task.go                    # 实时定位后台任务
│  │
│  └─ logger/
│     └─ logger.go                  # 日志初始化
│
├─ web/                             # 已有前端页面和未来正式前端目录
├─ database/                        # 本地 PostgreSQL/PostGIS 初始化 SQL
├─ docker/                          # 本地 MQTT Broker 配置
├─ docker-compose.yml               # 本地 PostgreSQL/PostGIS + MQTT Broker
├─ .env.example                     # 本地运行配置模板
└─ README.md                        # 当前说明
```

## 实时定位链路

当前最小实现：

```text
location.Task
  -> 周期性刷新“清澜一号”演示位置
  -> location.Store 保存最新位置
  -> api.LocationHandler 读取单台或全量最新位置
  -> 前端或调试工具通过 HTTP 获取位置
```

后续真实实现时，可以把 `location.Task` 替换成：

```text
MQTT 订阅机器人定位消息
  -> 校验定位数据
  -> 写入 PostgreSQL/PostGIS
  -> 更新最新位置缓存
  -> HTTP 接口返回最新位置
```

## 本地运行

一键启动本地 PostgreSQL/PostGIS 数据库：

```powershell
.\start-db.bat
```

启动本地 PostgreSQL/PostGIS 和 MQTT Broker：

```powershell
docker compose up -d
```

MQTT 本地端口：

```text
TCP: 1883
WebSocket: 9001
```

启动 Go 后端：

```powershell
copy .env.example .env
go run ./cmd/watercleanbot
```

访问：

```text
http://localhost:8080/api/robots/locations
http://localhost:8080/api/robots/清澜一号/location
```

## 当前刻意不做

- 不做账号权限。
- 不做任务管理。
- 不做告警管理。
- 不做命令下发。
- 不做完整 MQTT 入库。
- 不做完整 PostgreSQL 读写。

这些能力等实时定位链路跑通后，再逐步加回来。
