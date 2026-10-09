package location

import (
	"context"
	"database/sql"
	"os"
	"testing"
	"time"

	_ "github.com/lib/pq"
)

// TestRepositoryUpsertIntegration 用真实 PostgreSQL 验证当前位置的落盘 SQL。
// 需要设置 WATERCLEANBOT_TEST_DATABASE_URL 才会执行，否则跳过。
// 该测试使用独立临时 schema，不会改动真实业务表。
func TestRepositoryUpsertIntegration(t *testing.T) {
	dsn := os.Getenv("WATERCLEANBOT_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set WATERCLEANBOT_TEST_DATABASE_URL to run against a real PostgreSQL")
	}

	admin, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer admin.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		t.Fatalf("ping database: %v", err)
	}

	const schema = "wc_repository_test"
	if _, err := admin.ExecContext(ctx, "DROP SCHEMA IF EXISTS "+schema+" CASCADE"); err != nil {
		t.Fatalf("drop schema: %v", err)
	}
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create schema: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cleanupCancel()
		_, _ = admin.ExecContext(cleanupCtx, "DROP SCHEMA IF EXISTS "+schema+" CASCADE")
	})

	if _, err := admin.ExecContext(ctx, `CREATE TABLE `+schema+`.robot_current_locations (
		robot_name TEXT PRIMARY KEY,
		lat DOUBLE PRECISION,
		lng DOUBLE PRECISION,
		heading DOUBLE PRECISION,
		speed DOUBLE PRECISION,
		battery DOUBLE PRECISION,
		status INTEGER NOT NULL,
		source_timestamp_ms BIGINT,
		geom GEOMETRY(Point, 4326) GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lng, lat), 4326)) STORED,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
	)`); err != nil {
		t.Fatalf("create locations table: %v", err)
	}
	if _, err := admin.ExecContext(ctx, `CREATE TABLE `+schema+`.robot_distance_totals (
		robot_name TEXT PRIMARY KEY,
		last_distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
		total_distance_km DOUBLE PRECISION NOT NULL DEFAULT 0,
		updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
	)`); err != nil {
		t.Fatalf("create distance table: %v", err)
	}

	scoped, err := sql.Open("postgres", dsn+"&search_path="+schema)
	if err != nil {
		t.Fatalf("open scoped database: %v", err)
	}
	defer scoped.Close()
	if _, err := scoped.ExecContext(ctx, "SET search_path TO "+schema+", public"); err != nil {
		t.Fatalf("set search_path: %v", err)
	}

	repository := NewRepository(scoped)
	now := time.Now().UnixMilli()
	position := Position{
		RobotName:         "USV-INTEGRATION",
		Lat:               Float(31.289038468),
		Lng:               Float(121.42960939616665),
		Heading:           Float(197.831),
		Speed:             Float(0.2155),
		Battery:           Float(66),
		Status:            1,
		SourceTimestampMS: now,
		LastDistanceKm:    Float(0.9031),
		TotalDistanceKm:   Float(0.9031),
	}

	written, err := repository.UpsertCurrentPosition(ctx, position, now)
	if err != nil {
		t.Fatalf("UpsertCurrentPosition rejected a millisecond timestamp: %v", err)
	}
	if !written {
		t.Fatal("UpsertCurrentPosition reported no write")
	}

	var sourceTimestamp sql.NullInt64
	var battery sql.NullFloat64
	if err := scoped.QueryRowContext(ctx,
		`SELECT source_timestamp_ms, battery FROM robot_current_locations WHERE robot_name = $1`,
		position.RobotName,
	).Scan(&sourceTimestamp, &battery); err != nil {
		t.Fatalf("read back location: %v", err)
	}
	if !sourceTimestamp.Valid || sourceTimestamp.Int64 != now {
		t.Fatalf("source_timestamp_ms = %+v, want %d", sourceTimestamp, now)
	}
	if !battery.Valid || battery.Float64 != 66 {
		t.Fatalf("battery = %+v, want 66", battery)
	}

	var lastDistance, totalDistance float64
	if err := scoped.QueryRowContext(ctx,
		`SELECT last_distance_km, total_distance_km FROM robot_distance_totals WHERE robot_name = $1`,
		position.RobotName,
	).Scan(&lastDistance, &totalDistance); err != nil {
		t.Fatalf("read back distance totals: %v", err)
	}
	if lastDistance != 0.9031 || totalDistance != 0.9031 {
		t.Fatalf("distance totals = (%v, %v), want (0.9031, 0.9031)", lastDistance, totalDistance)
	}

	// 缺少设备时间戳时写 NULL，同时仍要成功更新其余字段。
	position.SourceTimestampMS = 0
	position.Battery = Float(61)
	if _, err := repository.UpsertCurrentPosition(ctx, position, now+2000); err != nil {
		t.Fatalf("UpsertCurrentPosition rejected a zero source timestamp: %v", err)
	}
	if err := scoped.QueryRowContext(ctx,
		`SELECT source_timestamp_ms, battery FROM robot_current_locations WHERE robot_name = $1`,
		position.RobotName,
	).Scan(&sourceTimestamp, &battery); err != nil {
		t.Fatalf("read back location after second write: %v", err)
	}
	if sourceTimestamp.Valid {
		t.Fatalf("source_timestamp_ms = %v, want NULL for a zero device timestamp", sourceTimestamp.Int64)
	}
	if !battery.Valid || battery.Float64 != 61 {
		t.Fatalf("battery after second write = %+v, want 61", battery)
	}
}
