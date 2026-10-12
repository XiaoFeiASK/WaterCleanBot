<!-- 文件作用：说明 WaterCleanBot 当前最小后端范围、文件架构和实时定位链路。 -->

# WaterCleanBot

WaterCleanBot 是水面垃圾清洁机器人项目。后端通过 MQTT 接收实时定位，使用内存作为运行期状态源，通过 SSE 推送前端，并异步保存 PostgreSQL 最后位置快照。

前端页面原型已经基本定型，仍保留在 `web/1/`，当前不改页面结构和交互内容。

## 当前后端范围

当前后端先做两件事：

```text
实时定位接收与推送
  -> MQTT 位置到达后立即更新内存
  -> SSE 实时推送前端
  -> PostgreSQL 低频异步保存最后快照

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
POST /api/robots                 # 添加设备：{"robotName":"USV-002"}
DELETE /api/robots/{robotName}    # 删除设备当前位置记录
GET /api/robots/locations
GET /api/robots/locations/stream  # SSE
GET /api/robots/{robotName}/location
POST /api/robots/{robotName}/commands
GET /api/robots/{robotName}/cameras
GET /api/robots/{robotName}/routes
POST /api/robots/{robotName}/routes
DELETE /api/robots/{robotName}/routes/{routeId}
POST /api/robots/{robotName}/routes/{routeId}/send
GET /api/robots/{robotName}/tracks
POST /api/robots/{robotName}/tracks
POST /api/robots/{robotName}/tracks/{trackId}/end
GET /api/robots/{robotName}/tracks/{trackId}/points
DELETE /api/robots/{robotName}/tracks/{trackId}
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
│  │  └─ location_handler.go        # HTTP 查询与 SSE 位置流
│  │
│  ├─ config/
│  │  └─ config.go                  # 读取 HTTP、MQTT 和快照持久化配置
│  │
│  ├─ location/
│  │  ├─ model.go                   # 实时位置数据结构
│  │  ├─ store.go                   # 实时位置内存状态与 SSE 广播
│  │  ├─ snapshot_writer.go         # 合并并异步持久化最后位置
│  │  └─ task.go                    # 启动时加载数据库快照
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

当前实现：

```text
进程启动
  -> 从 robot_current_locations 加载一次最后位置快照
  -> 启动 MQTT 订阅

MQTT telemetry / [18,...] webfeedback（设备可按 5Hz 上报）
  -> 校验定位数据
  -> location.Store 立即更新内存
  -> /api/robots/locations/stream 立即通过 SSE 推送前端
  -> SnapshotWriter 按设备只保留最新待写快照
  -> 每 LOCATION_SNAPSHOT_INTERVAL（默认 1s）异步写 PostgreSQL
```

数据库不再周期性覆盖实时内存；数据库故障也不会阻塞 MQTT 到内存/SSE 的实时链路。HTTP 单台和全量查询接口保留用于显式查询与调试。

航程反馈通过 `usv/{robotName}/webfeedback` 的 `[19,...]` 报文上报，P11（数组下标 11）表示当前开机周期累计航程，单位为米（m）。后端解析时换算为千米，保留 `distanceKm` 作为本次航程，并根据相邻累计读数计算 `totalDistanceKm`；读数下降表示船端重新开机，新读数作为新周期增量。实时值立即通过 SSE 推送，`robot_distance_totals` 表按现有快照周期合并保存最后船端读数和总航程，后端启动时恢复累计基准。

`robot_distance_totals` 由 Goose 迁移自动创建。数据库中的历史航程按米值误标为千米，`00004` 迁移会一次性换算为正确的千米值。位置快照与航程基准在同一数据库事务中更新；设备删除时两条记录也在同一事务中清理。功能上线前没有历史航程可补录，因此某设备第一次收到航程反馈时，当前开机读数会作为初始总航程。

已有数据库升级时，Goose 会先将旧的 `last_distance_meters`、`total_distance_meters` 列重命名为 `*_km`，再通过 `00004` 迁移把字段中原先直接保存的 P11 米值除以 1000。

## 设备编队增删

设备编队页面支持添加船和确认删除。添加的船舶编号必须与 MQTT Topic 中的设备名一致，不能重复。新增设备先进入后端内存并通过 SSE 通知页面，再保存到现有 `robot_current_locations` 表；尚未上报的经纬度、航向、速度和电量为 `NULL`，页面显示“待接入”，地图不生成虚假位置点。

已有数据库须先手动执行 `database/create_robot_current_locations.sql` 中的 `ALTER TABLE` 段，允许上述五列为空；此步骤不删除现有数据，不会由应用自动执行。

删除先清理后端设备缓存和待写入的旧快照、推送 `deleted` 事件，再硬删除当前位置行。前端同步移除列表、地图和该设备的反馈缓存。没有删除黑名单；设备再次上报 MQTT 遥测后会自动重新出现并保存。数据库写入失败时接口返回 `503` 和 `cacheChanged: true`，缓存变更保留，后台继续重试；重试队列仅在内存中，持久化成功前重启进程会丢失未保存的变更。

## 遥控下发链路

当前最小实现：

```text
前端遥控面板
  -> POST /api/robots/{robotName}/commands
  -> 后端校验设备名、油门范围和开关状态
  -> 普通遥控指令通过 MQTT 发布到 usv/{robotName}/websend（QoS 1）
  -> 船坞弹出 [EA 01 EB] 发布到 MQTT_DOCK_EJECT_TOPIC（默认 a40i/sub，QoS 0）
  -> 前端显示已发布或失败
```

指令和航线下发只确认 MQTT 消息是否成功发布，不等待设备 ACK，也不会因为没有 ACK 返回 `504`。成功响应的 `status` 为 `published`，并返回实际发布的 `protocol` 数组；船坞弹出响应还返回十六进制展示字段 `protocolHex`。

心跳回执：主程序以 2Hz 静默发布 `[17]`，仅处理艇端返回的 `[17,p1,17,...]` 来更新位置接口中的 `heartbeatStatus`、`heartbeatLastAckAt` 和 `heartbeatMisses`，不用于确认遥控或航线下发。连续约 2 秒未收到回执后标记为 `offline`，恢复收到回执后标记为 `online`，前端只更新状态徽标。

HTTP 接口保留语义化的 `command`、`value` 和 `values`，用于前端校验与状态维护；一般指令按 IF_CC2IIP 协议编码为纯数字 JSON 数组，船坞弹出则发布固定的原始十六进制字节帧：

```text
心跳              [17]          以 2Hz 自动发送
控制模式切换      [20,p1]       p1: 0 手动，1 自主
停船              [23]
循迹开关          [24,p1]       p1: 0 停止循迹，1 开始按航线循迹
船坞弹出          EA 01 EB      原始 3 字节：0xEA 0x01 0xEB
电源开关          [36,p1,p2]    p1: 1-6 分路编号，p2: 0 关闭，1 开启
垃圾清理开关      [38,p1]       p1: 0 停止，1 开始
设置目标油门      [39,p1,p2]    p1: 0 左，1 右；p2: 0-100
```

例如，左油门设为 30 发布 `[39,0,30]`，明轮上电发布 `[36,4,1]`；地图右下角“循迹开关”开启发布 `[24,1]`、关闭发布 `[24,0]`，不依赖航线预览或解锁条件。开关仅表示当前页面最近成功发布的目标状态，不代表艇端执行反馈。执行机构中的“船坞弹出”是一次性动作，HTTP 请求为 `{"command":"DOCK_EJECT"}`，发布原始字节 `EA 01 EB`（不是字符串或十进制 JSON 数组）。船坞弹出的 HTTP 成功响应中的 `protocol` 字段返回十进制等价值 `[234,1,235]`，并通过 `protocolHex` 返回 `[EA 01 EB]` 供前端展示。指令不使用 retain；生产环境仍应增加权限、审计和急停策略。

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

## 历史轨迹链路

```text
前端点击“开始记录”
  -> POST /api/robots/{robotName}/tracks 创建一条 recording 轨迹

MQTT telemetry / [18,...] webfeedback（有效 WGS-84 定位）
  -> location.Store 校验坐标后交给 tracks.Service
  -> 内存采样（与上一点相距 ≥1 米，或距上次入库 ≥2 秒）
  -> 有限队列异步写入 robot_tracks / robot_track_points，不阻塞 MQTT 与 SSE

前端“结束记录”
  -> POST /api/robots/{robotName}/tracks/{trackId}/end 等待已入队点落库后置为 ended
  -> GET /api/robots/{robotName}/tracks/{trackId}/points 按需加载完整点集
  -> LocationMap 用独立 polyline 图层回看，单条红色、多条调色板
```

每台设备同一时刻最多一条 recording 轨迹；轨迹号按设备递增且删除后不回收，轨迹永久保留。删除设备时在同一事务内级联删除该设备全部轨迹和轨迹点。关闭或刷新页面不会结束记录，也不结束轨迹。

轨迹点始终以 WGS-84 存储和传输，前端仅在高德地图渲染前转换为 GCJ-02，不做平滑或曲线拟合。

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

需要先在 `.env` 中配置全局共用的 `CAMERA_FRONT_RTSP` 和 `CAMERA_REAR_RTSP`。MediaMTX 默认常驻拉流（`MTX_PATHS_*_SOURCEONDEMAND=no`）：容器会一直保持摄像头 RTSP 连接，避免按需模式下每次无客户端就断开、下次请求重新拨号导致 10 秒以上冷启动和频繁超时失败。`start-video.bat` 会使用 `--force-recreate` 重建 MediaMTX 容器，确保 `.env` 中修改后的 RTSP 地址生效。后端接口 `GET /api/robots/{robotName}/cameras` 对所有合法设备名返回同一组浏览器播放地址，默认指向 MediaMTX HLS 端口 `http://localhost:8888`，不返回原始 RTSP 账号密码。生产部署时可把 `CAMERA_HLS_BASE_URL` 改成服务器公网或反向代理地址。

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

角色按权限从低到高分为：`user`（普通用户）、`superuser`（超级用户）、`admin`（管理员用户）。

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

数据库迁移会在后端启动时自动执行，创建 `users` 与 `user_sessions`。开发环境可使用 HTTP；生产环境必须设置 `APP_ENV=production`、`AUTH_COOKIE_SECURE=true` 并通过 HTTPS 提供站点。`AUTH_TRUSTED_PROXIES` 仅填写真实反向代理 IP。

> 安全边界：当前登录会阻止未登录用户进入前端控制台，但机器人、航线、遥控等既有业务 API 尚未加入服务端鉴权，仍可被直接调用。因此本期不构成完整的业务访问控制；下一阶段应为这些接口增加 Session 鉴权和角色授权。
