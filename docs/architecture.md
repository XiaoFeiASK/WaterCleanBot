# Architecture

This document explains the first deployable shape of the platform.

```text
Robot -> MQTT Broker -> Go backend -> PostgreSQL/PostGIS
                              |
                              -> Management dashboard API
```

## Components

- Robot firmware publishes telemetry and subscribes to command topics.
- MQTT Broker routes telemetry, command, and acknowledgement messages.
- Go backend validates messages and writes to PostgreSQL.
- PostgreSQL/PostGIS stores business, historical telemetry, and spatial data.
- Management dashboard calls HTTPS APIs exposed by the Go backend.

## First-Version Rule

Keep the first version as one Go backend service. Do not split microservices until the telemetry path and operational needs are proven.
