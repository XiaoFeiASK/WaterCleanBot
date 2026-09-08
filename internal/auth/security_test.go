package auth

import "testing"

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
	if ValidatePassword("12345678") == nil {
		t.Fatal("weak password accepted")
	}
	if ValidatePassword("清洁平台Safe9") != nil {
		t.Fatal("valid password rejected")
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
