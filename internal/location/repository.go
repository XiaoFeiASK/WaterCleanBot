// 文件作用：封装机器人当前位置的数据库查询逻辑。

package location

import (
	"context"
	"database/sql"
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
