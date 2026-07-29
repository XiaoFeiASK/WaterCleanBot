<!-- 文件作用：说明正式前端工程的运行方式和数据边界。 -->

# WaterCleanBot Frontend

正式前端基于 React + Vite，视觉结构参考 `../1/` 原型，业务数据只通过后端 HTTP API 获取。

## 开发

```bash
npm install
npm run dev
```

开发服务器会把 `/api` 请求代理到 `http://localhost:8080`。机器人位置页面调用：

```text
GET /api/robots/{robotCode}/location
```

当前后端只提供单机器人位置查询接口，因此设备列表、统计、告警和任务模块会显示无数据状态，不使用前端模拟数据。
