-- +goose Up
-- 历史版本把船端上报的米值直接写入 *_distance_km 字段，需一次性换算为千米。
UPDATE robot_distance_totals
SET last_distance_km = last_distance_km / 1000,
    total_distance_km = total_distance_km / 1000;

-- +goose Down
UPDATE robot_distance_totals
SET last_distance_km = last_distance_km * 1000,
    total_distance_km = total_distance_km * 1000;
