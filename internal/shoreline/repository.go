package shoreline

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"
)

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

func (r *Repository) Get(ctx context.Context) (*Dataset, error) {
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	return readDataset(r.db.QueryRowContext(ctx, `SELECT revision, files, updated_at, uploaded_by_id, uploaded_by_name FROM public_shoreline WHERE id = 1`))
}

func readDataset(row *sql.Row) (*Dataset, error) {
	var dataset Dataset
	var raw []byte
	err := row.Scan(&dataset.Revision, &raw, &dataset.UpdatedAt, &dataset.UploadedBy.ID, &dataset.UploadedBy.DisplayName)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if err := json.Unmarshal(raw, &dataset.Files); err != nil {
		return nil, err
	}
	return &dataset, nil
}

// A table lock also serializes the first insert when no singleton row exists yet.
func (r *Repository) mutate(ctx context.Context, expected *string, files *Files, uploader Uploader) (*Dataset, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `LOCK TABLE public_shoreline IN EXCLUSIVE MODE`); err != nil {
		return nil, err
	}
	current, err := readDataset(tx.QueryRowContext(ctx, `SELECT revision, files, updated_at, uploaded_by_id, uploaded_by_name FROM public_shoreline WHERE id = 1`))
	if err != nil {
		return nil, err
	}
	if (current == nil && expected != nil) || (current != nil && (expected == nil || current.Revision != *expected)) {
		return nil, ErrConflict
	}
	var next *Dataset
	if files == nil {
		if _, err := tx.ExecContext(ctx, `DELETE FROM public_shoreline WHERE id = 1`); err != nil {
			return nil, err
		}
	} else {
		var token [16]byte
		if _, err := rand.Read(token[:]); err != nil {
			return nil, err
		}
		raw, err := json.Marshal(files)
		if err != nil {
			return nil, err
		}
		next, err = readDataset(tx.QueryRowContext(ctx, `
			INSERT INTO public_shoreline (id, revision, files, uploaded_by_id, uploaded_by_name)
			VALUES (1, $1, $2::jsonb, $3, $4)
			ON CONFLICT (id) DO UPDATE SET revision = EXCLUDED.revision, files = EXCLUDED.files,
			updated_at = now(), uploaded_by_id = EXCLUDED.uploaded_by_id, uploaded_by_name = EXCLUDED.uploaded_by_name
			RETURNING revision, files, updated_at, uploaded_by_id, uploaded_by_name
		`, hex.EncodeToString(token[:]), string(raw), uploader.ID, uploader.DisplayName))
		if err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return next, nil
}

func (r *Repository) Replace(ctx context.Context, expected *string, files Files, uploader Uploader) (*Dataset, error) {
	validated, err := ValidateFiles(files)
	if err != nil {
		return nil, err
	}
	return r.mutate(ctx, expected, &validated, uploader)
}

func (r *Repository) Delete(ctx context.Context, expected *string) error {
	_, err := r.mutate(ctx, expected, nil, Uploader{})
	return err
}
