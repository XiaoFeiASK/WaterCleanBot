package auth

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"regexp"
	"strings"
	"unicode/utf8"

	"golang.org/x/crypto/bcrypt"
)

var usernamePattern = regexp.MustCompile(`^[a-z0-9_]{4,32}$`)
var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)
var weakPasswords = map[string]struct{}{"password": {}, "password123": {}, "12345678": {}, "123456789": {}, "qwerty123": {}, "admin123": {}}

func Normalize(value string) string  { return strings.ToLower(strings.TrimSpace(value)) }
func ValidateUsername(v string) bool { return usernamePattern.MatchString(v) }
func ValidateEmail(v string) bool    { return len(v) <= 254 && emailPattern.MatchString(v) }
func ValidateDisplayName(v string) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(v))
	return n >= 2 && n <= 40
}
func ValidatePassword(v string) error {
	if utf8.RuneCountInString(v) < 8 || len([]byte(v)) > 72 {
		return errors.New("密码长度应为 8 个字符至 72 字节")
	}
	if _, ok := weakPasswords[strings.ToLower(v)]; ok {
		return errors.New("密码过于常见，请更换密码")
	}
	return nil
}
func HashPassword(v string) (string, error) {
	b, e := bcrypt.GenerateFromPassword([]byte(v), bcrypt.DefaultCost)
	return string(b), e
}
func CheckPassword(hash, v string) bool {
	return bcrypt.CompareHashAndPassword([]byte(hash), []byte(v)) == nil
}
func NewToken() (string, string, error) {
	b := make([]byte, 32)
	if _, e := rand.Read(b); e != nil {
		return "", "", e
	}
	raw := hex.EncodeToString(b)
	return raw, TokenHash(raw), nil
}
func TokenHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}
