package auth

import (
	"strings"
	"testing"

	"golang.org/x/crypto/bcrypt"
)

func TestValidationAndNormalization(t *testing.T) {
	if got := Normalize("  Admin@Example.COM "); got != "admin@example.com" {
		t.Fatalf("Normalize=%q", got)
	}
	if !ValidateUsername("water_bot1") {
		t.Fatal("valid username rejected")
	}
	if ValidateUsername("水务账号") {
		t.Fatal("invalid username accepted")
	}
	if !ValidateEmail("ops@example.com") {
		t.Fatal("valid email rejected")
	}
	if ValidateEmail("not-an-email") {
		t.Fatal("invalid email accepted")
	}
	if err := ValidatePassword("12345678"); err != nil {
		t.Fatalf("short password rejected: %v", err)
	}
	if ValidatePassword("清洁平台Safe9") != nil {
		t.Fatal("valid password rejected")
	}
	if err := ValidatePassword(""); err == nil {
		t.Fatal("empty password accepted")
	}
	if !ValidateUsername(strings.Repeat("a", 128)) {
		t.Fatal("long username rejected")
	}
}
func TestPasswordHash(t *testing.T) {
	hash, err := HashPassword("Safe-water-2026")
	if err != nil {
		t.Fatal(err)
	}
	if hash == "Safe-water-2026" {
		t.Fatal("password stored in plaintext")
	}
	if !CheckPassword(hash, "Safe-water-2026") {
		t.Fatal("password check failed")
	}
	if CheckPassword(hash, "wrong-password") {
		t.Fatal("wrong password accepted")
	}
}
func TestPasswordHashAcceptsLongPassword(t *testing.T) {
	password := strings.Repeat("长密码", 40)
	hash, err := HashPassword(password)
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(hash, password) {
		t.Fatal("long password check failed")
	}
	if CheckPassword(hash, password+"x") {
		t.Fatal("long wrong password accepted")
	}
}
func TestPasswordHashSupportsLegacyHash(t *testing.T) {
	const password = "Safe-water-2026"
	legacy, err := bcrypt.GenerateFromPassword([]byte(password), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	if !CheckPassword(string(legacy), password) {
		t.Fatal("legacy password hash rejected")
	}
}
func TestSessionToken(t *testing.T) {
	raw, hash, err := NewToken()
	if err != nil {
		t.Fatal(err)
	}
	if raw == "" || hash == "" || raw == hash {
		t.Fatal("invalid token")
	}
	if TokenHash(raw) != hash {
		t.Fatal("token hash mismatch")
	}
}
