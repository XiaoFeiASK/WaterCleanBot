# Requirements Notes

This file captures product and database questions that must be confirmed before production design is frozen.

## Questions To Confirm

- How many robots are expected in the first batch?
- How many robots are expected after one year?
- How often does each robot report telemetry?
- Which telemetry fields are mandatory: location, battery, speed, trash weight, water quality, fault code?
- How long should raw telemetry be retained?
- Which aggregate data must be retained long term?
- What are the RPO and RTO targets?
- Which roles can view, control, and maintain robots?

## Initial Assumptions

- Coordinates use WGS84 / EPSG:4326.
- PostgreSQL stores all timestamps as `timestamptz`.
- Robots never connect to PostgreSQL directly.
- The backend performs validation, deduplication, and transactional writes.
