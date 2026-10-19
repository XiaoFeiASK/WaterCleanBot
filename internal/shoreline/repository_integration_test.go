package shoreline

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"testing/fstest"
	"time"

	_ "github.com/lib/pq"
	"github.com/pressly/goose/v3"
)

// TestRepositoryReplaceDeleteAndConflictIntegration uses an isolated PostgreSQL schema.
// Set WATERCLEANBOT_TEST_DATABASE_URL to run it against a real PostgreSQL instance.
func TestRepositoryReplaceDeleteAndConflictIntegration(t *testing.T) {
	dsn := os.Getenv("WATERCLEANBOT_TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("set WATERCLEANBOT_TEST_DATABASE_URL to run against a real PostgreSQL")
	}

	admin, err := sql.Open("postgres", dsn)
	if err != nil {
		t.Fatalf("open database: %v", err)
	}
	defer admin.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := admin.PingContext(ctx); err != nil {
		t.Fatalf("ping database: %v", err)
	}

	schema := fmt.Sprintf("wcb_shoreline_%x", time.Now().UnixNano())
	if _, err := admin.ExecContext(ctx, "CREATE SCHEMA "+schema); err != nil {
		t.Fatalf("create isolated schema: %v", err)
	}
	t.Cleanup(func() {
		cleanupCtx, cleanupCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cleanupCancel()
		_, _ = admin.ExecContext(cleanupCtx, "DROP SCHEMA IF EXISTS "+schema+" CASCADE")
	})

	scopedURL, err := url.Parse(dsn)
	if err != nil || scopedURL.Scheme == "" {
		t.Fatalf("WATERCLEANBOT_TEST_DATABASE_URL must be a PostgreSQL URL: %v", err)
	}
	query := scopedURL.Query()
	options := strings.TrimSpace(query.Get("options") + " -c search_path=" + schema)
	query.Set("options", options)
	scopedURL.RawQuery = query.Encode()
	db, err := sql.Open("postgres", scopedURL.String())
	if err != nil {
		t.Fatalf("open scoped database: %v", err)
	}
	defer db.Close()
	db.SetMaxOpenConns(4)
	if err := db.PingContext(ctx); err != nil {
		t.Fatalf("ping scoped database: %v", err)
	}

	// Run the real Goose migration inside the isolated schema rather than a test-only table definition.
	migration, err := os.ReadFile("../../database/00006_create_public_shoreline.sql")
	if err != nil {
		t.Fatalf("read shoreline migration: %v", err)
	}
	provider, err := goose.NewProvider(goose.DialectPostgres, db, fstest.MapFS{
		"00006_create_public_shoreline.sql": &fstest.MapFile{Data: migration},
	})
	if err != nil {
		t.Fatalf("create migration provider: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("apply shoreline migration: %v", err)
	}
	if _, err := provider.Up(ctx); err != nil {
		t.Fatalf("rerun shoreline migration: %v", err)
	}

	repository := NewRepository(db)
	uploader := Uploader{ID: "integration-user", DisplayName: "Integration Test"}
	initial, err := repository.Replace(ctx, nil, fullTestFiles(), uploader)
	if err != nil {
		t.Fatalf("insert initial dataset: %v", err)
	}
	if initial == nil || initial.Revision == "" || initial.UploadedBy != uploader {
		t.Fatalf("initial dataset metadata = %+v", initial)
	}
	stored, err := repository.Get(ctx)
	if err != nil || stored == nil || string(stored.Files.Shoreline) == "" {
		t.Fatalf("read inserted dataset: dataset=%+v err=%v", stored, err)
	}

	if len(stored.Files.Left) == 0 || len(stored.Files.Center) == 0 || len(stored.Files.Right) == 0 {
		t.Fatal("complete bundle did not persist all optional reference files")
	}

	stale := initial.Revision
	updated, err := repository.Replace(ctx, &stale, Files{Shoreline: testShoreline()}, uploader)
	if err != nil {
		t.Fatalf("replace with current revision: %v", err)
	}
	if updated.Revision == stale {
		t.Fatal("replacement did not issue a new revision")
	}
	if _, err := repository.Replace(ctx, &stale, Files{Shoreline: testShoreline()}, uploader); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale replacement error = %v, want ErrConflict", err)
	}

	// A fresh repository (another page/process) sees only the current whole bundle.
	reader := NewRepository(db)
	stored, err = reader.Get(ctx)
	if err != nil || stored == nil || stored.Revision != updated.Revision {
		t.Fatalf("read replacement from another repository: dataset=%+v err=%v", stored, err)
	}
	if len(stored.Files.Left) != 0 || len(stored.Files.Center) != 0 || len(stored.Files.Right) != 0 {
		t.Fatal("shoreline-only replacement retained old optional reference files")
	}
	if err := repository.Delete(ctx, &stale); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale deletion error = %v, want ErrConflict", err)
	}
	if _, err := repository.Replace(ctx, &updated.Revision, Files{Shoreline: raw(`{}`)}, uploader); err == nil {
		t.Fatal("invalid replacement unexpectedly succeeded")
	}
	stored, err = reader.Get(ctx)
	if err != nil || stored == nil || stored.Revision != updated.Revision {
		t.Fatalf("failed mutations changed official dataset: dataset=%+v err=%v", stored, err)
	}
	if err := repository.Delete(ctx, &updated.Revision); err != nil {
		t.Fatalf("delete dataset: %v", err)
	}
	stored, err = reader.Get(ctx)
	if err != nil || stored != nil {
		t.Fatalf("deleted data is not empty: dataset=%+v err=%v", stored, err)
	}
	if _, err := repository.Replace(ctx, &updated.Revision, fullTestFiles(), uploader); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale replacement after deletion error = %v, want ErrConflict", err)
	}
	// Even the first insert into an empty table must detect competing uploads.
	results := runConcurrentMutations(func() error {
		_, err := repository.Replace(ctx, nil, fullTestFiles(), uploader)
		return err
	}, func() error {
		_, err := repository.Replace(ctx, nil, fullTestFiles(), uploader)
		return err
	})
	assertOneMutationWins(t, results)

	// Two clients with the same revision must not both mutate the singleton row.
	current, err := repository.Get(ctx)
	if err != nil || current == nil {
		t.Fatalf("read before concurrent replacement: dataset=%+v err=%v", current, err)
	}
	results = runConcurrentMutations(func() error {
		_, err := repository.Replace(ctx, &current.Revision, Files{Shoreline: testShoreline()}, uploader)
		return err
	}, func() error {
		_, err := repository.Replace(ctx, &current.Revision, Files{Shoreline: testShoreline()}, uploader)
		return err
	})
	assertOneMutationWins(t, results)

	current, err = repository.Get(ctx)
	if err != nil || current == nil {
		t.Fatalf("read before concurrent replace/delete: dataset=%+v err=%v", current, err)
	}
	results = runConcurrentMutations(func() error {
		_, err := repository.Replace(ctx, &current.Revision, Files{Shoreline: testShoreline()}, uploader)
		return err
	}, func() error {
		return repository.Delete(ctx, &current.Revision)
	})
	assertOneMutationWins(t, results)
}

func runConcurrentMutations(first, second func() error) []error {
	start := make(chan struct{})
	results := make([]error, 2)
	var group sync.WaitGroup
	group.Add(2)
	go func() { defer group.Done(); <-start; results[0] = first() }()
	go func() { defer group.Done(); <-start; results[1] = second() }()
	close(start)
	group.Wait()
	return results
}

func assertOneMutationWins(t *testing.T, results []error) {
	t.Helper()
	wins, conflicts := 0, 0
	for _, err := range results {
		switch {
		case err == nil:
			wins++
		case errors.Is(err, ErrConflict):
			conflicts++
		default:
			t.Fatalf("concurrent mutation failed unexpectedly: %v", err)
		}
	}
	if wins != 1 || conflicts != 1 {
		t.Fatalf("concurrent mutations produced %d wins and %d conflicts; want one each", wins, conflicts)
	}
}
