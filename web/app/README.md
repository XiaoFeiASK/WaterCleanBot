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

位置响应格式：

```json
{
  "lat": 31.07,
  "lng": 120.88,
  "heading": 135.0,
  "speed": 2.3,
  "battery": 68.0,
  "distanceMeters": 326.4,
  "totalDistanceMeters": 18250.7,
  "status": 1,
  "robotName": "清澜一号"
}
```

`distanceMeters` 是设备当前开机周期的航程，`totalDistanceMeters` 是后端跨开机周期累计并持久化的总航程。两者在尚未收到航程反馈时可以省略。

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
