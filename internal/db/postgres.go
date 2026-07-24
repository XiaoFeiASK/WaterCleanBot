package db

import (
	"context"
	"errors"
)

// PostgresStore is the future home for PostgreSQL/PostGIS access.
// It is a placeholder today so the project template can compile without third-party dependencies.
type PostgresStore struct {
	databaseURL string
}

// NewPostgresStore records the connection string.
// The next implementation step should create a pgx connection pool here.
func NewPostgresStore(databaseURL string) *PostgresStore {
	return &PostgresStore{databaseURL: databaseURL}
}

// Ping verifies that database configuration exists.
// Replace this with an actual SELECT 1 query after pgx is introduced.
func (s *PostgresStore) Ping(_ context.Context) error {
	if s.databaseURL == "" {
		return errors.New("DATABASE_URL is empty")
	}
	return nil
}
