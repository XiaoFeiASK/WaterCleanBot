-- +goose Up
ALTER TABLE IF EXISTS robot_current_locations
    ADD COLUMN IF NOT EXISTS position_updated_at_ms BIGINT;

-- +goose StatementBegin
DO $$
BEGIN
    IF to_regclass('robot_current_locations') IS NOT NULL THEN
        UPDATE robot_current_locations
        SET position_updated_at_ms = (EXTRACT(EPOCH FROM updated_at) * 1000)::bigint
        WHERE position_updated_at_ms IS NULL
          AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180
          AND NOT (lat = 0 AND lng = 0);
    END IF;
END $$;
-- +goose StatementEnd

-- +goose Down
ALTER TABLE IF EXISTS robot_current_locations DROP COLUMN IF EXISTS position_updated_at_ms;
