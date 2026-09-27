-- +goose Up
ALTER TABLE robot_distance_totals
    RENAME COLUMN last_distance_meters TO last_distance_km;

ALTER TABLE robot_distance_totals
    RENAME COLUMN total_distance_meters TO total_distance_km;

ALTER TABLE robot_distance_totals
    RENAME CONSTRAINT robot_distance_totals_last_check TO robot_distance_totals_last_km_check;

ALTER TABLE robot_distance_totals
    RENAME CONSTRAINT robot_distance_totals_total_check TO robot_distance_totals_total_km_check;

-- +goose Down
ALTER TABLE robot_distance_totals
    RENAME CONSTRAINT robot_distance_totals_last_km_check TO robot_distance_totals_last_check;

ALTER TABLE robot_distance_totals
    RENAME CONSTRAINT robot_distance_totals_total_km_check TO robot_distance_totals_total_check;

ALTER TABLE robot_distance_totals
    RENAME COLUMN last_distance_km TO last_distance_meters;

ALTER TABLE robot_distance_totals
    RENAME COLUMN total_distance_km TO total_distance_meters;
