// 文件作用：封装规划航线和路径点的数据库读写逻辑。

package routes

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const routeQueryTimeout = 5 * time.Second

const routeSchemaSQL = `
CREATE TABLE IF NOT EXISTS planned_routes (
  id BIGSERIAL PRIMARY KEY,
  robot_name TEXT NOT NULL,
  route_code TEXT NOT NULL,
  route_type TEXT NOT NULL DEFAULT '折线',
  coordinate_system TEXT NOT NULL DEFAULT 'GCJ02',
  length_meters DOUBLE PRECISION NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT planned_routes_robot_route_unique UNIQUE (robot_name, route_code),
  CONSTRAINT planned_routes_coordinate_system_check CHECK (coordinate_system IN ('GCJ02', 'WGS84')),
  CONSTRAINT planned_routes_length_meters_check CHECK (length_meters >= 0),
  CONSTRAINT planned_routes_duration_seconds_check CHECK (duration_seconds >= 0)
);

CREATE TABLE IF NOT EXISTS planned_route_points (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES planned_routes(id) ON DELETE CASCADE,
  point_seq INTEGER NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  speed_knots DOUBLE PRECISION NOT NULL,

  CONSTRAINT planned_route_points_route_seq_unique UNIQUE (route_id, point_seq),
  CONSTRAINT planned_route_points_lng_check CHECK (lng BETWEEN -180 AND 180),
  CONSTRAINT planned_route_points_lat_check CHECK (lat BETWEEN -90 AND 90),
  CONSTRAINT planned_route_points_speed_knots_check CHECK (speed_knots > 0 AND speed_knots <= 100)
);

CREATE INDEX IF NOT EXISTS idx_planned_routes_robot_name_route_code
  ON planned_routes (robot_name, route_code);
CREATE INDEX IF NOT EXISTS idx_planned_route_points_route_id_seq
  ON planned_route_points (route_id, point_seq);
`

// Repository 负责规划航线持久化。
type Repository struct {
	db *sql.DB
}

// NewRepository 创建规划航线数据仓库。
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// EnsureSchema 创建规划航线所需数据库表。
func (r *Repository) EnsureSchema(ctx context.Context) error {
	queryCtx, cancel := context.WithTimeout(ctx, routeQueryTimeout)
	defer cancel()

	_, err := r.db.ExecContext(queryCtx, routeSchemaSQL)
	return err
}

// ListRoutes 查询指定机器人的所有规划航线和路径点。
func (r *Repository) ListRoutes(ctx context.Context, robotName string) ([]Route, error) {
	return r.queryRoutes(ctx, robotName, "")
}

// GetRoute 查询单条航线。
func (r *Repository) GetRoute(ctx context.Context, robotName string, routeCode string) (Route, bool, error) {
	routes, err := r.queryRoutes(ctx, robotName, routeCode)
	if err != nil {
		return Route{}, false, err
	}
	if len(routes) == 0 {
		return Route{}, false, nil
	}
	return routes[0], true, nil
}

// CreateRoute 保存一条规划航线和全部路径点。
func (r *Repository) CreateRoute(ctx context.Context, robotName string, request CreateRouteRequest, metrics RouteMetrics) (Route, error) {
	normalizedRequest, err := NormalizeCreateRouteRequest(request)
	if err != nil {
		return Route{}, err
	}

	queryCtx, cancel := context.WithTimeout(ctx, routeQueryTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(queryCtx, nil)
	if err != nil {
		return Route{}, err
	}
	defer tx.Rollback()

	if _, err := tx.ExecContext(queryCtx, `LOCK TABLE planned_routes IN EXCLUSIVE MODE`); err != nil {
		return Route{}, err
	}

	routeCode, err := nextRouteCode(queryCtx, tx, robotName)
	if err != nil {
		return Route{}, err
	}

	var route Route
	err = tx.QueryRowContext(queryCtx, `
		INSERT INTO planned_routes (
			robot_name,
			route_code,
			route_type,
			coordinate_system,
			length_meters,
			duration_seconds
		)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, route_code, robot_name, route_type, coordinate_system, length_meters, duration_seconds, created_at, updated_at
	`, robotName, routeCode, normalizedRequest.Type, normalizedRequest.CoordinateSystem, metrics.LengthMeters, metrics.DurationSeconds).Scan(
		&route.DBID,
		&route.ID,
		&route.RobotName,
		&route.Type,
		&route.CoordinateSystem,
		&route.LengthMeters,
		&route.DurationSeconds,
		&route.CreatedAt,
		&route.UpdatedAt,
	)
	if err != nil {
		return Route{}, err
	}

	for _, point := range normalizedRequest.Points {
		if _, err := tx.ExecContext(queryCtx, `
			INSERT INTO planned_route_points (route_id, point_seq, lng, lat, speed_knots)
			VALUES ($1, $2, $3, $4, $5)
		`, route.DBID, point.Seq, point.Lng, point.Lat, point.SpeedKnots); err != nil {
			return Route{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return Route{}, err
	}

	route.Points = normalizedRequest.Points
	return route, nil
}

// UpdateRoute replaces the points and recalculated metrics of an existing route.
func (r *Repository) UpdateRoute(ctx context.Context, robotName string, routeCode string, request CreateRouteRequest, metrics RouteMetrics) (Route, bool, error) {
	normalizedRequest, err := NormalizeCreateRouteRequest(request)
	if err != nil {
		return Route{}, false, err
	}

	queryCtx, cancel := context.WithTimeout(ctx, routeQueryTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(queryCtx, nil)
	if err != nil {
		return Route{}, false, err
	}
	defer tx.Rollback()

	var route Route
	err = tx.QueryRowContext(queryCtx, `
		UPDATE planned_routes
		SET route_type = $3, coordinate_system = $4, length_meters = $5,
		    duration_seconds = $6, updated_at = now()
		WHERE robot_name = $1 AND route_code = $2
		RETURNING id, route_code, robot_name, route_type, coordinate_system, length_meters, duration_seconds, created_at, updated_at
	`, robotName, routeCode, normalizedRequest.Type, normalizedRequest.CoordinateSystem, metrics.LengthMeters, metrics.DurationSeconds).Scan(
		&route.DBID,
		&route.ID,
		&route.RobotName,
		&route.Type,
		&route.CoordinateSystem,
		&route.LengthMeters,
		&route.DurationSeconds,
		&route.CreatedAt,
		&route.UpdatedAt,
	)
	if err == sql.ErrNoRows {
		return Route{}, false, nil
	}
	if err != nil {
		return Route{}, false, err
	}
	if _, err := tx.ExecContext(queryCtx, `DELETE FROM planned_route_points WHERE route_id = $1`, route.DBID); err != nil {
		return Route{}, false, err
	}
	for _, point := range normalizedRequest.Points {
		if _, err := tx.ExecContext(queryCtx, `
			INSERT INTO planned_route_points (route_id, point_seq, lng, lat, speed_knots)
			VALUES ($1, $2, $3, $4, $5)
		`, route.DBID, point.Seq, point.Lng, point.Lat, point.SpeedKnots); err != nil {
			return Route{}, false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return Route{}, false, err
	}
	route.Points = normalizedRequest.Points
	return route, true, nil
}

// DeleteRoute 删除指定航线和级联路径点。
func (r *Repository) DeleteRoute(ctx context.Context, robotName string, routeCode string) (bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, routeQueryTimeout)
	defer cancel()

	result, err := r.db.ExecContext(queryCtx, `
		DELETE FROM planned_routes
		WHERE robot_name = $1 AND route_code = $2
	`, robotName, routeCode)
	if err != nil {
		return false, err
	}

	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return rowsAffected > 0, nil
}

func nextRouteCode(ctx context.Context, tx *sql.Tx, robotName string) (string, error) {
	var maxRouteNumber int
	if err := tx.QueryRowContext(ctx, `
		SELECT COALESCE(MAX(CAST(SUBSTRING(route_code FROM 3) AS INTEGER)), 0)
		FROM planned_routes
		WHERE robot_name = $1 AND route_code ~ '^R-[0-9]+$'
	`, robotName).Scan(&maxRouteNumber); err != nil {
		return "", err
	}
	return fmt.Sprintf("R-%03d", maxRouteNumber+1), nil
}

func (r *Repository) queryRoutes(ctx context.Context, robotName string, routeCode string) ([]Route, error) {
	queryCtx, cancel := context.WithTimeout(ctx, routeQueryTimeout)
	defer cancel()

	query := `
		SELECT
			r.id,
			r.route_code,
			r.robot_name,
			r.route_type,
			r.coordinate_system,
			r.length_meters,
			r.duration_seconds,
			r.created_at,
			r.updated_at,
			p.point_seq,
			p.lng,
			p.lat,
			p.speed_knots
		FROM planned_routes r
		LEFT JOIN planned_route_points p ON p.route_id = r.id
		WHERE r.robot_name = $1`
	args := []any{robotName}
	if routeCode != "" {
		query += ` AND r.route_code = $2`
		args = append(args, routeCode)
	}
	query += ` ORDER BY r.route_code, p.point_seq`

	rows, err := r.db.QueryContext(queryCtx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	routeOrder := make([]int64, 0)
	routeByID := make(map[int64]*Route)
	for rows.Next() {
		var routeID int64
		var route Route
		var pointSeq sql.NullInt64
		var lng sql.NullFloat64
		var lat sql.NullFloat64
		var speedKnots sql.NullFloat64

		if err := rows.Scan(
			&routeID,
			&route.ID,
			&route.RobotName,
			&route.Type,
			&route.CoordinateSystem,
			&route.LengthMeters,
			&route.DurationSeconds,
			&route.CreatedAt,
			&route.UpdatedAt,
			&pointSeq,
			&lng,
			&lat,
			&speedKnots,
		); err != nil {
			return nil, err
		}

		storedRoute, ok := routeByID[routeID]
		if !ok {
			route.DBID = routeID
			route.Points = make([]RoutePoint, 0)
			storedRoute = &route
			routeByID[routeID] = storedRoute
			routeOrder = append(routeOrder, routeID)
		}

		if pointSeq.Valid && lng.Valid && lat.Valid && speedKnots.Valid {
			storedRoute.Points = append(storedRoute.Points, RoutePoint{
				Seq:        int(pointSeq.Int64),
				Lng:        lng.Float64,
				Lat:        lat.Float64,
				SpeedKnots: speedKnots.Float64,
			})
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	routes := make([]Route, 0, len(routeOrder))
	for _, routeID := range routeOrder {
		routes = append(routes, *routeByID[routeID])
	}
	return routes, nil
}
