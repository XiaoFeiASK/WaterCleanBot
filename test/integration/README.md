# Integration Tests

This folder will contain tests that start PostgreSQL/PostGIS, apply migrations, and verify backend behavior.

Initial scenarios to add:

- Duplicate telemetry is ignored by `robot_id + boot_id + seq_no`.
- `robot_shadow` is updated when a newer telemetry sample arrives.
- Recent trajectory queries return points in timestamp order.
- Spatial queries can find robots inside a selected area.
