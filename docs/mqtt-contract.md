# MQTT 协议约定

本文档定义 MQTT 主题和载荷规则。

## 主题

```text
v1/robots/{robotCode}/telemetry
v1/robots/{robotCode}/commands
v1/robots/{robotCode}/acks
```

后端订阅以下主题：

```text
v1/robots/+/telemetry
v1/robots/+/acks
```

## 遥测载荷

```json
{
  "robot_id": "H20-001",
  "boot_id": "b0e4c1f0-0000-0000-0000-000000000000",
  "seq_no": 1024,
  "reported_at": "2026-07-23T08:30:00Z",
  "position": {
    "lat": 31.2304,
    "lng": 121.4737
  },
  "battery_percent": 78.5,
  "speed_mps": 0.8,
  "trash_weight_kg": 1.2,
  "sensor_data": {}
}
```

## 校验规则

- 主题中的机器人编码必须与载荷中的机器人编码一致。
- `boot_id` 和 `seq_no` 是去重必填字段。
- 纬度必须在 -90 到 90 之间。
- 经度必须在 -180 到 180 之间。
- 电量百分比必须在 0 到 100 之间。
