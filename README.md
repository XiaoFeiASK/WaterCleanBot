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
  -> MQTT 发布到对应无人艇 `usv/{robotName}/web` Topic

规划航线下发
  -> HTTP 接口保存和查询数据库航线
  -> 校验路径点经纬度和到点速度
  -> 编码 [40,点数,经度,纬度,速度,...]
  -> MQTT 发布到对应无人艇 `usv/{robotName}/web` Topic
```

当前位置接口：

```text
GET /api/robots/locations
GET /api/robots/{robotName}/location
POST /api/robots/{robotName}/commands
GET /api/robots/{robotName}/cameras
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
    "BRUSH_R": 0,
    "OPERATING_MODE": 0,
    "CLEANING": 0,
    "TRACKING": 0,
    "PADDLE_POWER": 0
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
  -> MQTT 发布 usv/{robotName}/websend
  -> 前端显示已发布或失败
```

指令和航线下发只确认 MQTT 消息是否成功发布，不等待设备 ACK，也不会因为没有 ACK 返回 `504`。成功响应的 `status` 为 `published`，并返回实际发布的 `protocol` 数组。

心跳回执：主程序以 2Hz 静默发布 `[17]`，仅处理艇端返回的 `[17,p1,17,...]` 来更新位置接口中的 `heartbeatStatus`、`heartbeatLastAckAt` 和 `heartbeatMisses`，不用于确认遥控或航线下发。连续约 2 秒未收到回执后标记为 `offline`，恢复收到回执后标记为 `online`，前端只更新状态徽标。

HTTP 接口保留语义化的 `command`、`value` 和 `values`，用于前端校验与状态维护；发布给艇端的 MQTT payload 则按 IF_CC2IIP 协议编码为纯数字 JSON 数组：

```text
心跳              [17]          以 2Hz 自动发送
控制模式切换      [20,p1]       p1: 0 手动，1 自主
停船              [23]
循迹开关          [24,p1]       p1: 0 停止，1 开始
电源开关          [36,p1,p2]    p1: 1-6 分路编号，p2: 0 关闭，1 开启
垃圾清理开关      [38,p1]       p1: 0 停止，1 开始
设置目标油门      [39,p1,p2]    p1: 0 左，1 右；p2: 0-100
```

例如，左油门设为 30 发布 `[39,0,30]`，明轮上电发布 `[36,4,1]`。HTTP 成功响应中的 `protocol` 字段会返回同一数组，供前端显示实际下发内容。指令不使用 retain；生产环境仍应增加权限、审计和急停策略。

## 规划航线链路

当前最小实现：

```text
前端在线地图规划航线
  -> 点击地图选择航点
  -> 每个航点确认前填写“到该点速度”，单位节
  -> POST /api/robots/{robotName}/routes 保存到 planned_routes / planned_route_points
  -> GET /api/robots/{robotName}/routes 查询真实数据库航线
  -> POST /api/robots/{robotName}/routes/{routeId}/send 下发
  -> MQTT 发布 usv/{robotName}/web
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

启动摄像头 HLS 中转服务：

```powershell
.\start-video.bat
```

需要先在 `.env` 中配置全局共用的 `CAMERA_FRONT_RTSP` 和 `CAMERA_REAR_RTSP`。`start-video.bat` 会使用 `--force-recreate` 重建 MediaMTX 容器，确保 `.env` 中修改后的 RTSP 地址生效。后端接口 `GET /api/robots/{robotName}/cameras` 对所有合法设备名返回同一组浏览器播放地址，默认指向 MediaMTX HLS 端口 `http://localhost:8888`，不返回原始 RTSP 账号密码。生产部署时可把 `CAMERA_HLS_BASE_URL` 改成服务器公网或反向代理地址。

## 当前刻意不做

- 已接入账号登录与 Session；业务 API 的角色权限仍待接入。
- 不做任务管理。
- 不做告警管理。
- 不做命令 ACK 和审计入库。
- 不做完整 MQTT 入库。
- 不做完整 PostgreSQL 业务读写。

这些能力等实时定位链路跑通后，再逐步加回来。

## 账号与登录

应用现支持真实 PostgreSQL 账号、bcrypt 密码哈希和服务端 Session。启动后访问前端 `/register` 注册普通用户，或在 `.env` 中同时配置以下四项初始化第一个超级用户：

```text
INITIAL_SUPERUSER_USERNAME=
INITIAL_SUPERUSER_PASSWORD=
INITIAL_SUPERUSER_EMAIL=
INITIAL_SUPERUSER_DISPLAY_NAME=
```

认证接口：

```text
GET    /api/auth/config
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/logout
GET    /api/auth/me
PATCH  /api/auth/profile
POST   /api/auth/change-password
```

数据库迁移会在后端启动时自动执行，创建 `users` 与 `user_sessions`。开发环境可使用 HTTP；生产环境必须设置 `APP_ENV=production`、`AUTH_COOKIE_SECURE=true` 并通过 HTTPS 提供站点。`AUTH_ALLOWED_ORIGINS` 应填写实际可信前端来源，`AUTH_TRUSTED_PROXIES` 仅填写真实反向代理 IP。

> 安全边界：当前登录会阻止未登录用户进入前端控制台，但机器人、航线、遥控等既有业务 API 尚未加入服务端鉴权，仍可被直接调用。因此本期不构成完整的业务访问控制；下一阶段应为这些接口增加 Session 鉴权和角色授权。
