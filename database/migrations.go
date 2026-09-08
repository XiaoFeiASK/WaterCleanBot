// Package dbmigrations runs embedded, versioned SQL migrations from database/.
package dbmigrations

import (
	"context"
	"database/sql"
	"embed"

	"github.com/pressly/goose/v3"
)

//go:embed 00001_create_auth_tables.sql
var files embed.FS

// Up applies database migrations that have not run yet.
func Up(ctx context.Context, db *sql.DB) error {
	goose.SetBaseFS(files)
	if err := goose.SetDialect("postgres"); err != nil {
		return err
	}
	return goose.UpContext(ctx, db, ".")
}
