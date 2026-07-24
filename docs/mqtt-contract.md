# MQTT Contract

This document defines MQTT topics and payload rules.

## Topics

```text
v1/robots/{robotCode}/telemetry
v1/robots/{robotCode}/commands
v1/robots/{robotCode}/acks
```

The backend subscribes to:

```text
v1/robots/+/telemetry
v1/robots/+/acks
```

## Telemetry Payload

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

## Validation Rules

- Topic robot code must match the payload robot code.
- `boot_id` and `seq_no` are required for deduplication.
- Latitude must be between -90 and 90.
- Longitude must be between -180 and 180.
- Battery percentage must be between 0 and 100.
