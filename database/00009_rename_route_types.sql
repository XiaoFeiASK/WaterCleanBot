-- +goose Up
UPDATE planned_routes SET route_type = '自定航线' WHERE route_type IN ('折线', '普通航线');
UPDATE planned_routes SET route_type = '智能岸线' WHERE route_type = '规划航线';
UPDATE planned_routes SET route_type = '智能中线' WHERE route_type = '感知航线';

ALTER TABLE planned_routes ALTER COLUMN route_type SET DEFAULT '自定航线';

-- +goose Down
UPDATE planned_routes SET route_type = '折线' WHERE route_type = '自定航线';
UPDATE planned_routes SET route_type = '规划航线' WHERE route_type = '智能岸线';
UPDATE planned_routes SET route_type = '感知航线' WHERE route_type = '智能中线';

ALTER TABLE planned_routes ALTER COLUMN route_type SET DEFAULT '折线';
