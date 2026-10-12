// 文件作用：封装历史轨迹和轨迹点的 PostgreSQL 读写。

package tracks

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"github.com/lib/pq"
)

const queryTimeout = 5 * time.Second

// Repository 负责历史轨迹持久化。
type Repository struct {
	db *sql.DB
}

func NewRepository(db *sql.DB) *Repository {
	return &Repository{db: db}
}

// ListTracks 返回设备全部轨迹摘要，按轨迹序号升序。
func (r *Repository) ListTracks(ctx context.Context, robotName string) ([]Track, error) {
	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT t.id, t.robot_name, t.track_no, t.status, t.started_at, t.ended_at,
		       (SELECT COUNT(*) FROM robot_track_points p WHERE p.track_id = t.id)
		FROM robot_tracks t
		WHERE t.robot_name = $1
		ORDER BY t.track_no ASC, t.id ASC
	`, robotName)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	tracks := make([]Track, 0)
	for rows.Next() {
		var track Track
		if err := rows.Scan(&track.ID, &track.RobotName, &track.TrackNo, &track.Status, &track.StartedAt, &track.EndedAt, &track.PointCount); err != nil {
			return nil, err
		}
		track.Name = fmt.Sprintf("轨迹 %d", track.TrackNo)
		tracks = append(tracks, track)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return tracks, nil
}

// CreateTrack 在同一事务内分配设备内自增序号并创建 recording 轨迹。
func (r *Repository) CreateTrack(ctx context.Context, robotName string) (Track, error) {
	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	tx, err := r.db.BeginTx(queryCtx, nil)
	if err != nil {
		return Track{}, err
	}
	defer tx.Rollback()

	// 计数器行既负责串行化同一设备的创建，又保证删除最高编号轨迹后不会复用编号。
	if _, err := tx.ExecContext(queryCtx, `
		INSERT INTO robot_track_counters (robot_name)
		VALUES ($1)
		ON CONFLICT (robot_name) DO NOTHING
	`, robotName); err != nil {
		return Track{}, err
	}

	var counterValue int64
	if err := tx.QueryRowContext(queryCtx, `
		SELECT next_track_no
		FROM robot_track_counters
		WHERE robot_name = $1
		FOR UPDATE
	`, robotName).Scan(&counterValue); err != nil {
		return Track{}, err
	}

	var activeID int64
	err = tx.QueryRowContext(queryCtx, `
		SELECT id FROM robot_tracks
		WHERE robot_name = $1 AND status = 'recording'
		LIMIT 1
	`, robotName).Scan(&activeID)
	if err == nil {
		return Track{}, ErrActiveTrack
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return Track{}, err
	}

	var nextTrackNo int64
	if err := tx.QueryRowContext(queryCtx, `
		UPDATE robot_track_counters
		SET next_track_no = next_track_no + 1
		WHERE robot_name = $1
		RETURNING next_track_no - 1
	`, robotName).Scan(&nextTrackNo); err != nil {
		return Track{}, err
	}

	var track Track
	err = tx.QueryRowContext(queryCtx, `
		INSERT INTO robot_tracks (robot_name, track_no, status)
		VALUES ($1, $2, 'recording')
		RETURNING id, robot_name, track_no, status, started_at, ended_at, 0
	`, robotName, nextTrackNo).Scan(
		&track.ID, &track.RobotName, &track.TrackNo, &track.Status, &track.StartedAt, &track.EndedAt, &track.PointCount,
	)
	if err != nil {
		if isUniqueViolation(err) {
			return Track{}, ErrActiveTrack
		}
		return Track{}, err
	}
	if err := tx.Commit(); err != nil {
		return Track{}, err
	}
	track.Name = fmt.Sprintf("轨迹 %d", track.TrackNo)
	return track, nil
}

// EndTrack 结束指定设备的一条进行中轨迹。
func (r *Repository) EndTrack(ctx context.Context, robotName string, trackID int64) (Track, error) {
	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	var track Track
	err := r.db.QueryRowContext(queryCtx, `
		WITH ended AS (
			UPDATE robot_tracks
			SET status = 'ended', ended_at = now(), updated_at = now()
			WHERE id = $1 AND robot_name = $2 AND status = 'recording'
			RETURNING id, robot_name, track_no, status, started_at, ended_at
		)
		SELECT ended.id, ended.robot_name, ended.track_no, ended.status, ended.started_at, ended.ended_at,
		       (SELECT COUNT(*) FROM robot_track_points p WHERE p.track_id = ended.id)
		FROM ended
	`, trackID, robotName).Scan(
		&track.ID, &track.RobotName, &track.TrackNo, &track.Status, &track.StartedAt, &track.EndedAt, &track.PointCount,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return Track{}, r.trackStatusError(queryCtx, robotName, trackID)
	}
	if err != nil {
		return Track{}, err
	}
	track.Name = fmt.Sprintf("轨迹 %d", track.TrackNo)
	return track, nil
}

// ListPoints 返回指定设备归属的一条轨迹的全部点。
func (r *Repository) ListPoints(ctx context.Context, robotName string, trackID int64) ([]Point, bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	var exists bool
	if err := r.db.QueryRowContext(queryCtx, `
		SELECT EXISTS (SELECT 1 FROM robot_tracks WHERE id = $1 AND robot_name = $2)
	`, trackID, robotName).Scan(&exists); err != nil {
		return nil, false, err
	}
	if !exists {
		return nil, false, nil
	}

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT point_seq, lng, lat, received_at
		FROM robot_track_points
		WHERE track_id = $1
		ORDER BY point_seq ASC
	`, trackID)
	if err != nil {
		return nil, true, err
	}
	defer rows.Close()

	points := make([]Point, 0)
	for rows.Next() {
		var point Point
		if err := rows.Scan(&point.Seq, &point.Lng, &point.Lat, &point.ReceivedAt); err != nil {
			return nil, true, err
		}
		points = append(points, point)
	}
	if err := rows.Err(); err != nil {
		return nil, true, err
	}
	return points, true, nil
}

// DeleteTrack 只删除已结束轨迹，删除后轨迹点由外键级联清理。
func (r *Repository) DeleteTrack(ctx context.Context, robotName string, trackID int64) (bool, error) {
	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	result, err := r.db.ExecContext(queryCtx, `
		DELETE FROM robot_tracks
		WHERE id = $1 AND robot_name = $2 AND status = 'ended'
	`, trackID, robotName)
	if err != nil {
		return false, err
	}
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if rowsAffected > 0 {
		return true, nil
	}
	return false, r.trackDeleteStatusError(queryCtx, robotName, trackID)
}

// ActiveTracks 在服务启动时恢复所有进行中轨迹的采样状态。
func (r *Repository) ActiveTracks(ctx context.Context) ([]ActiveTrack, error) {
	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	rows, err := r.db.QueryContext(queryCtx, `
		SELECT
			t.id,
			t.robot_name,
			t.track_no,
			p.lat,
			p.lng,
			p.received_at,
			COALESCE(p.point_seq, 0)
		FROM robot_tracks t
		LEFT JOIN LATERAL (
			SELECT lat, lng, received_at, point_seq
			FROM robot_track_points
			WHERE track_id = t.id
			ORDER BY point_seq DESC
			LIMIT 1
		) p ON true
		WHERE t.status = 'recording'
		ORDER BY t.id
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	active := make([]ActiveTrack, 0)
	for rows.Next() {
		var item ActiveTrack
		var lastLat, lastLng sql.NullFloat64
		var lastReceivedAt sql.NullTime
		if err := rows.Scan(&item.ID, &item.RobotName, &item.TrackNo, &lastLat, &lastLng, &lastReceivedAt, &item.NextPointSeq); err != nil {
			return nil, err
		}
		if lastLat.Valid {
			item.LastLat = &lastLat.Float64
		}
		if lastLng.Valid {
			item.LastLng = &lastLng.Float64
		}
		if lastReceivedAt.Valid {
			item.LastReceivedAt = lastReceivedAt.Time
		}
		active = append(active, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return active, nil
}

// AddPoint 为轨迹追加一个采样点，使用 point_seq 保证顺序稳定。
func (r *Repository) AddPoint(ctx context.Context, trackID int64, point Point) error {
	queryCtx, cancel := context.WithTimeout(ctx, queryTimeout)
	defer cancel()

	result, err := r.db.ExecContext(queryCtx, `
		INSERT INTO robot_track_points (track_id, point_seq, lng, lat, received_at)
		SELECT t.id, $2, $3, $4, $5
		FROM robot_tracks t
		WHERE t.id = $1 AND t.status = 'recording'
		ON CONFLICT (track_id, point_seq) DO NOTHING
	`, trackID, point.Seq, point.Lng, point.Lat, point.ReceivedAt)
	if err != nil {
		return err
	}
	if _, err := result.RowsAffected(); err != nil {
		return err
	}
	return nil
}

func (r *Repository) trackStatusError(ctx context.Context, robotName string, trackID int64) error {
	var status string
	err := r.db.QueryRowContext(ctx, `
		SELECT status FROM robot_tracks WHERE id = $1 AND robot_name = $2
	`, trackID, robotName).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status != StatusRecording {
		return ErrTrackNotEnded
	}
	return ErrNotFound
}

func (r *Repository) trackDeleteStatusError(ctx context.Context, robotName string, trackID int64) error {
	var status string
	err := r.db.QueryRowContext(ctx, `
		SELECT status FROM robot_tracks WHERE id = $1 AND robot_name = $2
	`, trackID, robotName).Scan(&status)
	if errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	}
	if err != nil {
		return err
	}
	if status == StatusRecording {
		return ErrTrackNotEnded
	}
	// 结束轨迹并发删除时，第一个请求已成功删除，第二个请求按不存在处理。
	return ErrNotFound
}

func isUniqueViolation(err error) bool {
	var pqErr *pq.Error
	return errors.As(err, &pqErr) && pqErr.Code == "23505"
}
