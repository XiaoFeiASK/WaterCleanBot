# Database Design

This document describes the first database model.

## Core Tables

- `robots`: physical robot records.
- `missions`: planned cleaning missions.
- `mission_waypoints`: planned mission path points.
- `mission_runs`: actual execution records for missions.
- `telemetry_samples`: historical telemetry records.
- `robot_shadow`: latest state per robot.
- `alarms`: robot and mission alarms.
- `commands`: backend commands sent to robots.

## Design Rules

- Use UUID primary keys for backend records.
- Use unique robot codes such as `H20-001`.
- Use PostGIS point columns for location.
- Use `robot_id + boot_id + seq_no` for telemetry idempotency.
- Insert telemetry history and update `robot_shadow` in one transaction.
- Add indexes for `(robot_id, reported_at DESC)` and spatial queries.
