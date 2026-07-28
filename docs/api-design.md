<!-- 文件作用：记录管理后台未来需要调用的 HTTP API 设计草案。 -->

# API 设计

本文档列出管理看板首批需要使用的 HTTP API。

## 健康检查

```text
GET /health
```

返回后端进程和数据库配置是否可用。

## 机器人

```text
GET /api/robots
GET /api/robots/{robotCode}
```

返回机器人记录和状态摘要。

## 遥测

```text
GET /api/robots/{robotCode}/telemetry/latest
GET /api/robots/{robotCode}/telemetry/history
```

返回机器人最新状态和历史轨迹数据。

## 命令

```text
POST /api/robots/{robotCode}/commands
GET /api/commands/{commandID}
```

创建机器人命令并检查命令执行状态。
