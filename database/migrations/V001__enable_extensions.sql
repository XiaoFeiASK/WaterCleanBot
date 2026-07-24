-- Enable database extensions required by the water cleaning robot platform.
-- PostGIS stores and queries robot coordinates, mission areas, and alarm locations.
CREATE EXTENSION IF NOT EXISTS postgis;

-- pgcrypto provides gen_random_uuid(), which is convenient for UUID primary keys.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
