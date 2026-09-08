package auth

import (
	"sync"
	"time"
)

type failureEntry struct {
	count        int
	blockedUntil time.Time
	updatedAt    time.Time
}
type ipEntry struct {
	attempts      []time.Time
	registrations []time.Time
}
type Limiter struct {
	mu       sync.Mutex
	failures map[string]failureEntry
	ips      map[string]ipEntry
	now      func() time.Time
}

func NewLimiter() *Limiter {
	return &Limiter{failures: map[string]failureEntry{}, ips: map[string]ipEntry{}, now: time.Now}
}
func recent(values []time.Time, after time.Time) []time.Time {
	out := values[:0]
	for _, v := range values {
		if v.After(after) {
			out = append(out, v)
		}
	}
	return out
}
func (l *Limiter) AllowLogin(login, ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	f := l.failures[login]
	if now.Before(f.blockedUntil) {
		return false
	}
	e := l.ips[ip]
	e.attempts = recent(e.attempts, now.Add(-15*time.Minute))
	if len(e.attempts) >= 30 {
		l.ips[ip] = e
		return false
	}
	e.attempts = append(e.attempts, now)
	l.ips[ip] = e
	return true
}
func (l *Limiter) LoginFailed(login string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	f := l.failures[login]
	if now.Sub(f.updatedAt) > 15*time.Minute {
		f.count = 0
	}
	f.count++
	f.updatedAt = now
	if f.count >= 5 {
		f.blockedUntil = now.Add(15 * time.Minute)
	}
	l.failures[login] = f
}
func (l *Limiter) LoginSucceeded(login string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	delete(l.failures, login)
}
func (l *Limiter) AllowRegistration(ip string) bool {
	l.mu.Lock()
	defer l.mu.Unlock()
	now := l.now()
	e := l.ips[ip]
	e.registrations = recent(e.registrations, now.Add(-time.Hour))
	l.ips[ip] = e
	return len(e.registrations) < 5
}
func (l *Limiter) RegistrationSucceeded(ip string) {
	l.mu.Lock()
	defer l.mu.Unlock()
	e := l.ips[ip]
	e.registrations = append(e.registrations, l.now())
	l.ips[ip] = e
}
