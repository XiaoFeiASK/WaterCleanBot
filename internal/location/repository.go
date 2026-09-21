// 文件作用：封装机器人当前位置的数据库快照读写。

package location

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

const currentPositionQueryTimeout = 5 * time.Second

// Repository 负责读取和持久化机器人最后位置快照。
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ListCurrentPositions 只用于后端启动时恢复最后位置，不参与运行期实时刷新。
func (r *Repository) ListCurrentPositions(ctx context.Context) ([]Position, error) {
	queryCtx, cancel := context.WithTimeout(ctx, currentPositionQueryTimeout)
	defer cancel()

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT p.robot_name, p.lat, p.lng, p.heading, p.speed, p.battery, p.status,
		       COALESCE(p.source_timestamp_ms, 0),
		       (EXTRACT(EPOCH FROM p.updated_at) * 1000)::bigint,
		       d.last_distance_meters,
		       d.total_distance_meters
		FROM robot_current_locations p
		LEFT JOIN robot_distance_totals d ON d.robot_name = p.robot_name
		ORDER BY p.robot_name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	positions := make([]Position, 0)
	for rows.Next() {
		var position Position
		if err := rows.Scan(
			&position.RobotName,
			&position.Lat,
			&position.Lng,
			&position.Heading,
			&position.Speed,
			&position.Battery,
			&position.Status,
			&position.SourceTimestampMS,
			&position.ReceivedAtMS,
			&position.LastDistanceMeters,
			&position.TotalDistanceMeters,
		); err != nil {
			return nil, err
		}
		positions = append(positions, position)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return positions, nil
}

// UpsertCurrentPosition 写入最后位置快照；按服务端接收时间防止较旧任务覆盖新快照。
func (r *Repository) UpsertCurrentPosition(ctx context.Context, position Position, receivedAtMS int64) (bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, currentPositionQueryTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(queryCtx, nil)
	if err != nil {
		return false, err
	}
	defer tx.Rollback()

	var robotName string
	err = tx.QueryRowContext(queryCtx, `
		INSERT INTO robot_current_locations (
			robot_name, lat, lng, heading, speed, battery, status, source_timestamp_ms, updated_at
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, NULLIF($8, 0), to_timestamp($9 / 1000.0))
		ON CONFLICT (robot_name) DO UPDATE SET
			lat = EXCLUDED.lat,
			lng = EXCLUDED.lng,
			heading = EXCLUDED.heading,
			speed = EXCLUDED.speed,
			battery = EXCLUDED.battery,
			status = EXCLUDED.status,
			source_timestamp_ms = EXCLUDED.source_timestamp_ms,
			updated_at = EXCLUDED.updated_at
		WHERE EXCLUDED.updated_at >= robot_current_locations.updated_at
		RETURNING robot_name
	`,
		position.RobotName,
		position.Lat,
		position.Lng,
		position.Heading,
		position.Speed,
		position.Battery,
		position.Status,
		position.SourceTimestampMS,
		receivedAtMS,
	).Scan(&robotName)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	if position.LastDistanceMeters != nil && position.TotalDistanceMeters != nil {
		if _, err := tx.ExecContext(queryCtx, `
			INSERT INTO robot_distance_totals (
				robot_name, last_distance_meters, total_distance_meters, updated_at
			)
			VALUES ($1, $2, $3, to_timestamp($4 / 1000.0))
			ON CONFLICT (robot_name) DO UPDATE SET
				last_distance_meters = EXCLUDED.last_distance_meters,
				total_distance_meters = EXCLUDED.total_distance_meters,
				updated_at = EXCLUDED.updated_at
		`, position.RobotName, *position.LastDistanceMeters, *position.TotalDistanceMeters, receivedAtMS); err != nil {
			return false, err
		}
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func (r *Repository) CreateCurrentPosition(ctx context.Context, robotName string) error {
	queryCtx, cancel := context.WithTimeout(ctx, currentPositionQueryTimeout)
	defer cancel()
	_, err := r.db.ExecContext(queryCtx, `INSERT INTO robot_current_locations (robot_name, status)
		VALUES ($1, 0) ON CONFLICT (robot_name) DO NOTHING`, robotName)
	return err
}

func (r *Repository) DeleteCurrentPosition(ctx context.Context, robotName string) error {
	queryCtx, cancel := context.WithTimeout(ctx, currentPositionQueryTimeout)
	defer cancel()
	tx, err := r.db.BeginTx(queryCtx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(queryCtx, `DELETE FROM robot_distance_totals WHERE robot_name = $1`, robotName); err != nil {
		return err
	}
	if _, err := tx.ExecContext(queryCtx, `DELETE FROM robot_current_locations WHERE robot_name = $1`, robotName); err != nil {
		return err
	}
	return tx.Commit()
}
