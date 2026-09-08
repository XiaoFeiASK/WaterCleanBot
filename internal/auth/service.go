package auth

import (
	"context"
	"errors"
	"log/slog"
	"strings"
	"time"
)

type Config struct {
	RegistrationEnabled bool
	CookieSecure        bool
	TrustedProxies      []string
	SessionDuration     time.Duration
	RememberDuration    time.Duration
}

type Service struct {
	repo    *Repository
	cfg     Config
	limiter *Limiter
	log     *slog.Logger
}

func NewService(repo *Repository, cfg Config, log *slog.Logger) *Service {
	return &Service{repo: repo, cfg: cfg, limiter: NewLimiter(), log: log}
}
func (s *Service) Config() Config { return s.cfg }
func (s *Service) Register(ctx context.Context, username, name, email, password, ip, ua string, remember bool) (User, string, error) {
	if !s.cfg.RegistrationEnabled {
		return User{}, "", ErrRegistrationDisabled
	}
	if !s.limiter.AllowRegistration(ip) {
		return User{}, "", ErrRateLimited
	}
	username = Normalize(username)
	email = Normalize(email)
	name = stringsTrim(name)
	fields := ValidateRegistration(username, name, email, password)
	if len(fields) > 0 {
		return User{}, "", &ValidationError{Fields: fields}
	}
	hash, err := HashPassword(password)
	if err != nil {
		return User{}, "", err
	}
	token, tokenHash, err := NewToken()
	if err != nil {
		return User{}, "", err
	}
	duration := s.cfg.SessionDuration
	if remember {
		duration = s.cfg.RememberDuration
	}
	u, err := s.repo.CreateUserWithSession(ctx, username, name, email, hash, tokenHash, ip, ua, time.Now().Add(duration), remember)
	if err != nil {
		return User{}, "", err
	}
	s.limiter.RegistrationSucceeded(ip)
	s.log.Info("user registered", slog.String("user_id", u.ID))
	return u, token, nil
}
func stringsTrim(v string) string { return strings.TrimSpace(v) }
func ValidateRegistration(username, name, email, password string) map[string]string {
	f := map[string]string{}
	if !ValidateUsername(username) {
		f["username"] = "用户名需为 4–32 位字母、数字或下划线"
	}
	if !ValidateDisplayName(name) {
		f["displayName"] = "显示名称需为 2–40 个字符"
	}
	if !ValidateEmail(email) {
		f["email"] = "请输入有效的邮箱地址"
	}
	if e := ValidatePassword(password); e != nil {
		f["password"] = e.Error()
	}
	return f
}
func (s *Service) Login(ctx context.Context, login, password, ip, ua string, remember bool) (User, string, error) {
	login = Normalize(login)
	if !s.limiter.AllowLogin(login, ip) {
		return User{}, "", ErrRateLimited
	}
	u, err := s.repo.FindByLogin(ctx, login)
	if err != nil || !CheckPassword(u.PasswordHash, password) {
		s.limiter.LoginFailed(login)
		s.log.Warn("login failed", slog.String("ip", ip))
		return User{}, "", ErrInvalidCredentials
	}
	if u.Status != "active" {
		return User{}, "", ErrDisabled
	}
	token, err := s.createSession(ctx, u.ID, ip, ua, remember)
	if err != nil {
		return User{}, "", err
	}
	_ = s.repo.MarkLogin(ctx, u.ID)
	s.limiter.LoginSucceeded(login)
	s.log.Info("login succeeded", slog.String("user_id", u.ID))
	return u, token, nil
}
func (s *Service) createSession(ctx context.Context, userID, ip, ua string, remember bool) (string, error) {
	raw, hash, err := NewToken()
	if err != nil {
		return "", err
	}
	duration := s.cfg.SessionDuration
	if remember {
		duration = s.cfg.RememberDuration
	}
	if err := s.repo.CreateSession(ctx, userID, hash, ip, ua, time.Now().Add(duration), remember); err != nil {
		return "", err
	}
	return raw, nil
}
func (s *Service) Authenticate(ctx context.Context, raw string) (User, Session, error) {
	if raw == "" {
		return User{}, Session{}, ErrUnauthenticated
	}
	u, sess, err := s.repo.UserBySession(ctx, TokenHash(raw))
	if err != nil {
		return User{}, Session{}, ErrUnauthenticated
	}
	if u.Status != "active" {
		_ = s.repo.DeleteSession(ctx, TokenHash(raw))
		return User{}, Session{}, ErrUnauthenticated
	}
	return u, sess, nil
}
func (s *Service) Logout(ctx context.Context, raw string) error {
	if raw == "" {
		return nil
	}
	return s.repo.DeleteSession(ctx, TokenHash(raw))
}
func (s *Service) ChangePassword(ctx context.Context, u User, sess Session, current, next, ip, ua string) (string, error) {
	if !CheckPassword(u.PasswordHash, current) {
		return "", ErrInvalidCredentials
	}
	if err := ValidatePassword(next); err != nil {
		return "", &ValidationError{Fields: map[string]string{"newPassword": err.Error()}}
	}
	hash, err := HashPassword(next)
	if err != nil {
		return "", err
	}
	if err = s.repo.UpdatePassword(ctx, u.ID, hash); err != nil {
		return "", err
	}
	if err = s.repo.DeleteSessionsForUser(ctx, u.ID); err != nil {
		return "", err
	}
	return s.createSession(ctx, u.ID, ip, ua, sess.RememberMe)
}
func (s *Service) UpdateProfile(ctx context.Context, u User, name string) (User, error) {
	name = stringsTrim(name)
	if !ValidateDisplayName(name) {
		return User{}, &ValidationError{Fields: map[string]string{"displayName": "显示名称需为 2–40 个字符"}}
	}
	return s.repo.UpdateDisplayName(ctx, u.ID, name)
}
func (s *Service) Cleanup(ctx context.Context) {
	ticker := time.NewTicker(time.Hour)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			if err := s.repo.DeleteExpiredSessions(ctx); err != nil {
				s.log.Warn("clean expired sessions failed", slog.Any("error", err))
			}
		}
	}
}
func (s *Service) InitializeSuperuser(ctx context.Context, username, name, email, password string) error {
	if username == "" && name == "" && email == "" && password == "" {
		s.log.Warn("initial superuser is not configured")
		return nil
	}
	if username == "" || name == "" || email == "" || password == "" {
		s.log.Warn("initial superuser configuration is incomplete")
		return nil
	}
	exists, err := s.repo.SuperuserExists(ctx)
	if err != nil {
		return err
	}
	if exists {
		return nil
	}
	username = Normalize(username)
	email = Normalize(email)
	name = stringsTrim(name)
	if f := ValidateRegistration(username, name, email, password); len(f) > 0 {
		return errors.New("invalid initial superuser configuration")
	}
	hash, err := HashPassword(password)
	if err != nil {
		return err
	}
	_, err = s.repo.CreateUser(ctx, username, name, email, hash, "superuser")
	return err
}
