package auth

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/lib/pq"
)

var (
	ErrUsernameExists = errors.New("username already exists")
	ErrEmailExists    = errors.New("email already exists")
	ErrNotFound       = errors.New("user not found")
)

type Repository struct{ db *sql.DB }

func NewRepository(db *sql.DB) *Repository { return &Repository{db: db} }

const userColumns = `id::text, username, display_name, email, password_hash, role, status, created_at, updated_at, last_login_at`
const qualifiedUserColumns = `u.id::text, u.username, u.display_name, u.email, u.password_hash, u.role, u.status, u.created_at, u.updated_at, u.last_login_at`

func scanUser(row interface{ Scan(...any) error }) (User, error) {
	var u User
	err := row.Scan(&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.PasswordHash, &u.Role, &u.Status, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt)
	return u, err
}

func uniqueError(err error) error {
	var pqErr *pq.Error
	if !errors.As(err, &pqErr) || pqErr.Code != "23505" {
		return err
	}
	if strings.Contains(pqErr.Constraint, "username") {
		return ErrUsernameExists
	}
	if strings.Contains(pqErr.Constraint, "email") {
		return ErrEmailExists
	}
	return err
}

func (r *Repository) CreateUser(ctx context.Context, username, displayName, email, passwordHash, role string) (User, error) {
	q := `INSERT INTO users (username, display_name, email, password_hash, role) VALUES ($1,$2,$3,$4,$5) RETURNING ` + userColumns
	u, err := scanUser(r.db.QueryRowContext(ctx, q, username, displayName, email, passwordHash, role))
	return u, uniqueError(err)
}

func (r *Repository) CreateUserWithSession(ctx context.Context, username, displayName, email, passwordHash, tokenHash, ip, userAgent string, expiresAt time.Time, remember bool) (User, error) {
	tx, err := r.db.BeginTx(ctx, nil)
	if err != nil {
		return User{}, err
	}
	defer tx.Rollback()
	q := `INSERT INTO users (username, display_name, email, password_hash, role) VALUES ($1,$2,$3,$4,'user') RETURNING ` + userColumns
	u, err := scanUser(tx.QueryRowContext(ctx, q, username, displayName, email, passwordHash))
	if err != nil {
		return User{}, uniqueError(err)
	}
	var address any
	if ip != "" {
		address = ip
	}
	if _, err = tx.ExecContext(ctx, `INSERT INTO user_sessions (user_id,token_hash,expires_at,ip_address,user_agent,remember_me) VALUES ($1,$2,$3,$4,$5,$6)`, u.ID, tokenHash, expiresAt, address, userAgent, remember); err != nil {
		return User{}, err
	}
	if err = tx.Commit(); err != nil {
		return User{}, err
	}
	return u, nil
}

func (r *Repository) FindByLogin(ctx context.Context, login string) (User, error) {
	q := `SELECT ` + userColumns + ` FROM users WHERE username=$1 OR email=$1 LIMIT 1`
	u, err := scanUser(r.db.QueryRowContext(ctx, q, login))
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (r *Repository) FindByID(ctx context.Context, id string) (User, error) {
	u, err := scanUser(r.db.QueryRowContext(ctx, `SELECT `+userColumns+` FROM users WHERE id=$1`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func (r *Repository) SuperuserExists(ctx context.Context) (bool, error) {
	var exists bool
	err := r.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM users WHERE role='superuser')`).Scan(&exists)
	return exists, err
}

func (r *Repository) CreateSession(ctx context.Context, userID, tokenHash, ip, userAgent string, expiresAt time.Time, remember bool) error {
	var address any
	if ip != "" {
		address = ip
	}
	_, err := r.db.ExecContext(ctx, `INSERT INTO user_sessions (user_id,token_hash,expires_at,ip_address,user_agent,remember_me) VALUES ($1,$2,$3,$4,$5,$6)`, userID, tokenHash, expiresAt, address, userAgent, remember)
	return err
}

func (r *Repository) UserBySession(ctx context.Context, tokenHash string) (User, Session, error) {
	q := `SELECT ` + qualifiedUserColumns + `, s.id::text, s.user_id::text, s.token_hash, s.expires_at, s.remember_me
          FROM user_sessions s JOIN users u ON u.id=s.user_id
          WHERE s.token_hash=$1 AND s.expires_at > NOW()`
	var u User
	var s Session
	err := r.db.QueryRowContext(ctx, q, tokenHash).Scan(&u.ID, &u.Username, &u.DisplayName, &u.Email, &u.PasswordHash, &u.Role, &u.Status, &u.CreatedAt, &u.UpdatedAt, &u.LastLoginAt, &s.ID, &s.UserID, &s.TokenHash, &s.ExpiresAt, &s.RememberMe)
	if errors.Is(err, sql.ErrNoRows) {
		return User{}, Session{}, ErrNotFound
	}
	if err == nil {
		_, _ = r.db.ExecContext(ctx, `UPDATE user_sessions SET last_used_at=NOW() WHERE id=$1`, s.ID)
	}
	return u, s, err
}

func (r *Repository) DeleteSession(ctx context.Context, tokenHash string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM user_sessions WHERE token_hash=$1`, tokenHash)
	return err
}
func (r *Repository) DeleteSessionsForUser(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM user_sessions WHERE user_id=$1`, userID)
	return err
}
func (r *Repository) DeleteExpiredSessions(ctx context.Context) error {
	_, err := r.db.ExecContext(ctx, `DELETE FROM user_sessions WHERE expires_at <= NOW()`)
	return err
}
func (r *Repository) MarkLogin(ctx context.Context, userID string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET last_login_at=NOW(),updated_at=NOW() WHERE id=$1`, userID)
	return err
}
func (r *Repository) UpdateDisplayName(ctx context.Context, userID, name string) (User, error) {
	u, err := scanUser(r.db.QueryRowContext(ctx, `UPDATE users SET display_name=$2,updated_at=NOW() WHERE id=$1 RETURNING `+userColumns, userID, name))
	return u, err
}
func (r *Repository) UpdatePassword(ctx context.Context, userID, hash string) error {
	_, err := r.db.ExecContext(ctx, `UPDATE users SET password_hash=$2,updated_at=NOW() WHERE id=$1`, userID, hash)
	return err
}
