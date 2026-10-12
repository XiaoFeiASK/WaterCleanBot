// 文件作用：用真实 PostgreSQL 验证轨迹编号、状态约束和设备删除级联。

package tracks

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

func TestRepositoryTrackLifecycleIntegration(t *testing.T) {
	dsn := os.Getenv("WATERCLEANBOT_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set WATERCLEANBOT_TEST_DATABASE_URL to run against a real PostgreSQL")
	}

	admin, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer admin.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		t.Fatalf("ping database: %v", err)
	}

	const schema = "wc_tracks_repository_test"
	if _, err := admin.ExecContext(ctx, "DROP SCHEMA IF EXISTS "+schema+" CASCADE"); err != nil {
		t.Fatalf("drop schema: %v", err)
	}
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 20*time.Second)
		defer cleanupCancel()
		_, _ = admin.ExecContext(cleanupCtx, "DROP SCHEMA IF EXISTS "+schema+" CASCADE")
	})

	scoped, err := sql.Open("postgres", dsn+"&search_path="+schema)
	if err != nil {
		t.Fatalf("open scoped database: %v", err)
	}
	defer scoped.Close()
	if _, err := scoped.ExecContext(ctx, "SET search_path TO "+schema+", public"); err != nil {
		t.Fatalf("set search_path: %v", err)
	}
	if _, err := scoped.ExecContext(ctx, `
		CREATE TABLE robot_track_counters (
			robot_name TEXT PRIMARY KEY,
			next_track_no BIGINT NOT NULL DEFAULT 1
		);
		CREATE TABLE robot_tracks (
			id BIGSERIAL PRIMARY KEY,
			robot_name TEXT NOT NULL,
			track_no BIGINT NOT NULL,
			status TEXT NOT NULL,
			started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			ended_at TIMESTAMPTZ,
			updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
			UNIQUE (robot_name, track_no)
		);
		CREATE UNIQUE INDEX robot_tracks_one_recording_per_robot ON robot_tracks (robot_name) WHERE status = 'recording';
		CREATE TABLE robot_track_points (
			id BIGSERIAL PRIMARY KEY,
			track_id BIGINT NOT NULL REFERENCES robot_tracks(id) ON DELETE CASCADE,
			point_seq BIGINT NOT NULL,
			lng DOUBLE PRECISION NOT NULL,
			lat DOUBLE PRECISION NOT NULL,
			received_at TIMESTAMPTZ NOT NULL,
			UNIQUE (track_id, point_seq)
		);
	`); err != nil {
		t.Fatalf("create track tables: %v", err)
	}

	repository := NewRepository(scoped)
	first, err := repository.CreateTrack(ctx, "USV-001")
	if err != nil {
		t.Fatalf("create first track: %v", err)
	}
	if first.TrackNo != 1 {
		t.Fatalf("first track no = %d, want 1", first.TrackNo)
	}
	if _, err := repository.CreateTrack(ctx, "USV-001"); !errors.Is(err, ErrActiveTrack) {
		t.Fatalf("second active create error = %v, want ErrActiveTrack", err)
	}
	if _, err := repository.EndTrack(ctx, "USV-001", first.ID); err != nil {
		t.Fatalf("end first track: %v", err)
	}
	if _, err := repository.DeleteTrack(ctx, "USV-001", first.ID); err != nil {
		t.Fatalf("delete ended track: %v", err)
	}

	second, err := repository.CreateTrack(ctx, "USV-001")
	if err != nil {
		t.Fatalf("create second track: %v", err)
	}
	if second.TrackNo != 2 {
		t.Fatalf("second track no = %d, want 2 after deletion", second.TrackNo)
	}
	if _, err := repository.DeleteTrack(ctx, "USV-001", second.ID); !errors.Is(err, ErrTrackNotEnded) {
		t.Fatalf("delete recording error = %v, want ErrTrackNotEnded", err)
	}
	if err := repository.AddPoint(ctx, second.ID, Point{Seq: 1, Lng: 121.4, Lat: 31.2, ReceivedAt: time.Now().UTC()}); err != nil {
		t.Fatalf("add point: %v", err)
	}
	if _, err := scoped.ExecContext(ctx, `DELETE FROM robot_tracks WHERE robot_name = $1`, "USV-001"); err != nil {
		t.Fatalf("delete robot tracks: %v", err)
	}
	var pointCount int
	if err := scoped.QueryRowContext(ctx, `SELECT COUNT(*) FROM robot_track_points`).Scan(&pointCount); err != nil {
		t.Fatalf("count orphan points: %v", err)
	}
	if pointCount != 0 {
		t.Fatalf("orphan points = %d, want 0", pointCount)
	}
}
