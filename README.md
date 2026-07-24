# WaterCleanBot

WaterCleanBot is the backend template for a water-surface trash cleaning robot platform.

The first backend milestone is intentionally small:

- Start a Go HTTP service.
- Start PostgreSQL with PostGIS locally.
- Define database migrations for robots, missions, telemetry, and current robot state.
- Receive robot telemetry through MQTT in a later step.
- Store historical telemetry in `telemetry_samples`.
- Update the latest robot state in `robot_shadow`.

## Architecture

```text
Robot
  -> MQTT Broker
  -> Go backend service
  -> PostgreSQL + PostGIS
  -> Management dashboard API
```

Robots should not connect to PostgreSQL directly. The backend service validates messages, applies idempotency rules, and writes data through SQL transactions.

## Repository Layout

```text
cmd/                  Application entry points.
internal/             Private Go packages for this backend service.
database/migrations/  Versioned SQL migration files.
database/seeds/       Development-only seed data.
docs/                 Requirements, architecture, MQTT, API, and deployment notes.
scripts/              Local helper scripts for database and deployment work.
test/                 Integration-test fixtures and future test packages.
deploy/               Staging and production deployment templates.
```

## Local Development

```powershell
copy .env.example .env
docker compose up -d
go run ./cmd/watercleanbot
```

The service starts with a basic health endpoint:

```text
GET http://localhost:8080/health
```

## Current Status

This repository is currently a scaffold. The files include comments that explain where each project part belongs and what should be implemented next.
