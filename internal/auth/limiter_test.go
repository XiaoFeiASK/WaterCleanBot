package auth

import (
	"testing"
	"time"
)

func TestLimiterLocksRepeatedFailures(t *testing.T) {
	l := NewLimiter()
	now := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return now }
	for i := 0; i < 5; i++ {
		if !l.AllowLogin("user", "127.0.0.1") {
			t.Fatalf("attempt %d unexpectedly blocked", i)
		}
		l.LoginFailed("user")
	}
	if l.AllowLogin("user", "127.0.0.1") {
		t.Fatal("username should be blocked")
	}
	now = now.Add(16 * time.Minute)
	if !l.AllowLogin("user", "127.0.0.1") {
		t.Fatal("block did not expire")
	}
}
func TestRegistrationLimit(t *testing.T) {
	l := NewLimiter()
	now := time.Now()
	l.now = func() time.Time { return now }
	for i := 0; i < 5; i++ {
		if !l.AllowRegistration("127.0.0.1") {
			t.Fatal("registration prematurely blocked")
		}
		l.RegistrationSucceeded("127.0.0.1")
	}
	if l.AllowRegistration("127.0.0.1") {
		t.Fatal("sixth registration should be blocked")
	}
}
