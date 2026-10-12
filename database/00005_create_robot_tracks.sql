-- +goose Up
CREATE TABLE IF NOT EXISTS robot_track_counters (
    robot_name TEXT PRIMARY KEY,
    next_track_no BIGINT NOT NULL DEFAULT 1,
    CONSTRAINT robot_track_counters_next_track_no_check CHECK (next_track_no > 0)
);

CREATE TABLE IF NOT EXISTS robot_tracks (
    id BIGSERIAL PRIMARY KEY,
    robot_name TEXT NOT NULL,
    track_no BIGINT NOT NULL,
    status TEXT NOT NULL DEFAULT 'recording',
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT robot_tracks_robot_track_no_unique UNIQUE (robot_name, track_no),
    CONSTRAINT robot_tracks_status_check CHECK (status IN ('recording', 'ended')),
    CONSTRAINT robot_tracks_track_no_check CHECK (track_no > 0),
    CONSTRAINT robot_tracks_time_check CHECK (ended_at IS NULL OR ended_at >= started_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS robot_tracks_one_recording_per_robot
    ON robot_tracks (robot_name)
    WHERE status = 'recording';

CREATE INDEX IF NOT EXISTS idx_robot_tracks_robot_started
    ON robot_tracks (robot_name, started_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS robot_track_points (
    id BIGSERIAL PRIMARY KEY,
    track_id BIGINT NOT NULL REFERENCES robot_tracks(id) ON DELETE CASCADE,
    point_seq BIGINT NOT NULL,
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    received_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT robot_track_points_track_seq_unique UNIQUE (track_id, point_seq),
    CONSTRAINT robot_track_points_seq_check CHECK (point_seq > 0),
    CONSTRAINT robot_track_points_lng_check CHECK (lng BETWEEN -180 AND 180),
    CONSTRAINT robot_track_points_lat_check CHECK (lat BETWEEN -90 AND 90)
);

CREATE INDEX IF NOT EXISTS idx_robot_track_points_track_seq
    ON robot_track_points (track_id, point_seq);

-- +goose Down
DROP TABLE IF EXISTS robot_track_points;
DROP TABLE IF EXISTS robot_tracks;
DROP TABLE IF EXISTS robot_track_counters;
