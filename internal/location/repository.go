// 文件作用：封装机器人当前位置的数据库查询逻辑。

package location

import (
	"context"
	"database/sql"
	"errors"
	"time"
)

const currentPositionQueryTimeout = 5 * time.Second

// Repository 负责从数据库读取机器人位置数据。
type Repository struct {
	db *sql.DB
}

// NewRepository 创建机器人位置数据仓库。
func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ListCurrentPositions 查询所有机器人的当前位置。
// 调用方：location.Task.refreshPositions，用于定时把数据库最新位置同步到内存缓存。
// 会调用：PostgreSQL robot_current_locations 表。
func (r *Repository) ListCurrentPositions(ctx context.Context) ([]Position, error) {
	queryCtx, cancel := context.WithTimeout(ctx, currentPositionQueryTimeout)
	defer cancel()

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT robot_name, lat, lng, heading, speed, battery, status
		FROM robot_current_locations
		ORDER BY robot_name
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

// UpsertCurrentPosition 写入或覆盖一台机器人的最新 MQTT 位置。
// 调用方：telemetry.Subscriber.handleMessage。
// 会调用：PostgreSQL robot_current_locations 表；只有新时间戳不会早于库里时间戳时才覆盖。
func (r *Repository) UpsertCurrentPosition(ctx context.Context, position Position, sourceTimestampMS int64) (bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, currentPositionQueryTimeout)
	defer cancel()

	var robotName string
	err := r.db.QueryRowContext(queryCtx, `
		INSERT INTO robot_current_locations (
			robot_name,
			lat,
			lng,
			heading,
			speed,
			battery,
			status,
			source_timestamp_ms
		)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
		ON CONFLICT (robot_name) DO UPDATE SET
			lat = EXCLUDED.lat,
			lng = EXCLUDED.lng,
			heading = EXCLUDED.heading,
			speed = EXCLUDED.speed,
			battery = EXCLUDED.battery,
			status = EXCLUDED.status,
			source_timestamp_ms = EXCLUDED.source_timestamp_ms,
			updated_at = now()
		WHERE robot_current_locations.source_timestamp_ms IS NULL
		   OR EXCLUDED.source_timestamp_ms >= robot_current_locations.source_timestamp_ms
		RETURNING robot_name
	`,
		position.RobotName,
		position.Lat,
		position.Lng,
		position.Heading,
		position.Speed,
		position.Battery,
		position.Status,
		sourceTimestampMS,
	).Scan(&robotName)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return true, nil
}
