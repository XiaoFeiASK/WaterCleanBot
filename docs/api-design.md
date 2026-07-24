# API Design

This document lists the first HTTP APIs for the management dashboard.

## Health

```text
GET /health
```

Returns whether the backend process and database configuration are usable.

## Robots

```text
GET /api/robots
GET /api/robots/{robotCode}
```

Returns robot records and status summaries.

## Telemetry

```text
GET /api/robots/{robotCode}/telemetry/latest
GET /api/robots/{robotCode}/telemetry/history
```

Returns latest robot state and historical trajectory data.

## Commands

```text
POST /api/robots/{robotCode}/commands
GET /api/commands/{commandID}
```

Creates robot commands and checks command execution status.
