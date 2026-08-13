<!-- 文件作用：说明 WaterCleanBot 当前最小后端范围、文件架构和实时定位链路。 -->

# WaterCleanBot

WaterCleanBot 是水面垃圾清洁机器人项目。当前后端阶段先保持极简：**暴露定位接口、运行定位刷新任务，并支持通过 MQTT 发布遥控指令和规划航线路径点**。

前端页面原型已经基本定型，仍保留在 `web/1/`，当前不改页面结构和交互内容。

## 当前后端范围

当前后端先做两件事：

```text
后台实时定位任务
  -> 查询数据库中的机器人最新位置
  -> HTTP 接口查询机器人最新位置

遥控指令下发
  -> HTTP 接口接收前端遥控指令
  -> 校验指令目标状态
  -> MQTT 发布到对应无人艇 command topic

规划航线下发
  -> HTTP 接口保存和查询数据库航线
  -> 校验路径点经纬度和到点速度
  -> 编码 [40,点数,经度,纬度,速度,...]
  -> MQTT 发布到对应无人艇 route topic
```

当前位置接口：

```text
GET /api/robots/locations
GET /api/robots/{robotName}/location
POST /api/robots/{robotName}/commands
GET /api/robots/{robotName}/routes
POST /api/robots/{robotName}/routes
DELETE /api/robots/{robotName}/routes/{routeId}
POST /api/robots/{robotName}/routes/{routeId}/send
```

示例：

```text
GET http://localhost:8080/api/robots/清澜一号/location
```

遥控指令示例：

```text
POST http://localhost:8080/api/robots/清澜一号/commands
Content-Type: application/json

{
  "command": "THROTTLE_L",
  "value": 30,
  "ttlMs": 800,
  "values": {
    "THROTTLE_L": 30,
    "THROTTLE_R": 0,
    "HATCH_CYLINDER": 0,
    "DISC_CYLINDER": 0,
    "CONVEYOR": 0,
    "BRUSH_L": 0,
    "BRUSH_R": 0
  }
}
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

### 坐标系约定

MQTT 遥测报文中的 `lat`、`lng` 采用 WGS-84，后端和 PostGIS 均按 WGS-84（SRID 4326）保存与返回。前端仅在传入高德地图 JS API 前转换为 GCJ-02；高德地图点击得到的航点已是 GCJ-02，不能重复转换。

当前最小实现：

```text
location.Task
  -> 周期性查询 robot_current_locations 表
  -> location.Store 缓存最新位置
  -> api.LocationHandler 读取单台或全量最新位置
  -> 前端或调试工具通过 HTTP 获取位置
```

后续接入 MQTT 后，可以把链路扩展成：

```text
MQTT 订阅机器人定位消息
  -> 校验定位数据
  -> 写入 PostgreSQL/PostGIS
  -> 更新最新位置缓存
  -> HTTP 接口返回最新位置
```

## 遥控下发链路

当前最小实现：

```text
前端遥控面板
  -> POST /api/robots/{robotName}/commands
  -> 后端校验设备名、油门范围和开关状态
  -> MQTT 发布 usv/{robotName}/command
  -> 前端显示已发布或失败
```

发布给艇端的 MQTT 报文包含 `commandId`、`seq`、`issuedAt`、`ttlMs` 和完整 `values` 目标状态。指令不使用 retain；生产环境应增加艇端 ACK topic、权限、审计和急停策略。

## 规划航线链路

当前最小实现：

```text
前端在线地图规划航线
  -> 点击地图选择航点
  -> 每个航点确认前填写“到该点速度”，单位节
  -> POST /api/robots/{robotName}/routes 保存到 planned_routes / planned_route_points
  -> GET /api/robots/{robotName}/routes 查询真实数据库航线
  -> POST /api/robots/{robotName}/routes/{routeId}/send 下发
  -> MQTT 发布 usv/{robotName}/route
```

艇端路径点发送协议按 `0x28` 编码，HTTP 下发接口会从数据库读取航线并发布纯数字 payload：

```text
[40,点数,经度,纬度,到该点速度,经度,纬度,到该点速度,...]
```

示例：

```text
[40,2,121.47370100,31.23041600,2.5,121.47410000,31.23090000,2]
```

前端高德地图点击点按 `GCJ-02` 保存；下发艇端时后端默认转换为 `WGS-84` 并将经纬度格式化为 8 位小数。

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
- 不做命令 ACK 和审计入库。
- 不做完整 MQTT 入库。
- 不做完整 PostgreSQL 业务读写。

这些能力等实时定位链路跑通后，再逐步加回来。
