<!-- 文件作用：说明正式前端工程的运行方式和数据边界。 -->

# WaterCleanBot Frontend

正式前端基于 React + Vite，视觉结构参考 `../1/` 原型，业务数据只通过后端 HTTP API 获取。

## 开发

```bash
npm install
npm run dev
```

开发服务器会把 `/api` 请求代理到 `http://localhost:8080`。机器人位置页面调用已确认的位置接口：

```text
GET /api/robots/locations
GET /api/robots/{robotName}/location
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
  "status": 1,
  "robotName": "清澜一号"
}
```

当前后端提供全量和单机器人位置查询接口；设备列表、告警和任务模块仍会显示无数据状态，不使用前端模拟数据。
