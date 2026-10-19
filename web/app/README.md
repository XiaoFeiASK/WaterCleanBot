<!-- 文件作用：说明正式前端工程的运行方式和数据边界。 -->

# WaterCleanBot Frontend

正式前端基于 React + Vite，视觉结构参考 `../1/` 原型，业务数据通过后端 HTTP API 与 SSE 获取。

## 开发

```bash
npm install
npm run dev
```

开发服务器会把 `/api` 请求代理到 `http://localhost:8080`。摄像头播放地址由后端返回，默认指向 MediaMTX HLS 端口 `http://localhost:8888`。机器人位置页面调用已确认的位置接口：

```text
GET /api/robots/locations
GET /api/robots/locations/stream  # SSE 实时位置流
GET /api/robots/{robotName}/location
GET /api/robots/{robotName}/cameras
```

当前前端设备映射集中在 `src/api.js`：`清澜一号` -> `清澜一号`。`VITE_API_BASE_URL` 可覆盖 API 基地址，当前部署应使用 HTTP 地址，HTTPS 由反向代理负责。

位置停报后保留最后有效坐标。`positionUpdatedAtMs` 为有效定位接收时间，独立于电量、油门与心跳的 `receivedAtMs`；超过 30 秒、心跳离线或 GNSS 无解时，地图显示“最后有效位置（非实时）”及定位时间。无有效定位或收到旧版服务的 `0,0` 时显示空状态，不把地图移到零点。需要同步部署后端及自动迁移 `00007`，才能在刷新和重启后准确保留定位时间。

位置响应格式：

```json
{
  "lat": 31.07,
  "lng": 120.88,
  "heading": 135.0,
  "speed": 2.3,
  "battery": 68.0,
  "distanceKm": 326.4,
  "totalDistanceKm": 18250.7,
  "status": 1,
  "robotName": "清澜一号"
}
```

`distanceKm` 和 `totalDistanceKm` 的数值单位均为千米（km）：前者是设备当前开机周期的航程，后者是后端跨开机周期累计并持久化的总航程。两者在尚未收到航程反馈时可以省略。

前端启动时建立一条 EventSource 连接，先接收 `snapshot` 全量快照，再接收 `position` 增量事件和 `deleted` 删除事件；断线时浏览器自动重连，不再按固定间隔轮询定位接口。

## 设备编队

“添加船”提交 `POST /api/robots`，请求体为 `{"robotName":"USV-002"}`；删除确认后调用 `DELETE /api/robots/{robotName}`。列表由后端 SSE 同步，后端先更新缓存再保存数据库。新船的五个遥测字段允许为 `null`，显示“待接入”和 `--`，收到定位后才在地图显示。删除后再次收到设备 MQTT 上报时自动恢复，无需手动添加。

部署前请手动执行 `../../database/create_robot_current_locations.sql` 中允许五个遥测列为空的 `ALTER TABLE` 段，并同时更新前后端。

## 航线规划

在线地图页的“航线规划”表格已改为真实接口数据，不再使用前端假数据：

```text
GET /api/robots/{robotName}/routes
POST /api/robots/{robotName}/routes
DELETE /api/robots/{robotName}/routes/{routeId}
POST /api/robots/{robotName}/routes/{routeId}/send
```

规划模式下点击地图后必须先填写“到该点速度（节）”，确认后航点才会进入草稿。保存时前端提交 `GCJ02` 坐标和 `speedKnots`，后端保存到数据库；下发时后端编码为 `[40,点数,经度,纬度,速度,...]`，并与遥控指令统一发布到 `usv/{robotName}/web` Topic。

## 公共河岸线

在线地图的“河道边界”图层从登录后端读取 PostgreSQL 中的公共数据；“岸线管理”可一次导入 `shoreline_lonlat.json` 与可选的左岸、中心、右岸参考线 JSON，校验后预览，再确认整套替换。未选择的可选参考线会被清空。取消预览不会写入正式数据；删除公共岸线会清除正式数据，但不会删除本机源文件，也不提供应用内历史回滚。

读取接口为 `GET /api/shoreline`，替换和删除分别使用 `PUT /api/shoreline`、`DELETE /api/shoreline`，需要有效登录 Session。替换与删除请求包含 `expectedRevision`；版本冲突返回 HTTP 409，需重新加载再确认。上传请求上限为 20 MiB。正式数据以数据库为准，进入地图、开启图层和窗口重新获得焦点时读取最新数据。

上传文件须为 schema v3、WGS84 且来自同一 `session_id`。后端最终校验结构、有效状态、侧别、经纬度和点数；支持 `completed` 和 `partial`，但会提示通行核验和测绘精度状态。页面仅展示几何，不以这些数据直接创建或下发可执行航线。地图绘制前才将坐标从 WGS84 转为高德地图使用的 GCJ-02；岸线按各轮廓、分段顺序绘制，参考线按参考连接标志断开，不跨组连接或闭合。

前端不再内置演示岸线或默认参考线。首次没有公共数据、删除成功后均显示空状态；取消预览恢复数据库中的正式图层，保存或删除失败时保留原数据。设备、轨迹和感知航线演示数据独立保留。
