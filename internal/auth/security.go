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

var usernamePattern = regexp.MustCompile(`^[a-z0-9_]+$`)
var emailPattern = regexp.MustCompile(`^[^\s@]+@[^\s@]+\.[^\s@]+$`)

func Normalize(value string) string  { return strings.ToLower(strings.TrimSpace(value)) }
func ValidateUsername(v string) bool { return usernamePattern.MatchString(v) }
func ValidateEmail(v string) bool    { return len(v) <= 254 && emailPattern.MatchString(v) }
func ValidateDisplayName(v string) bool {
	n := utf8.RuneCountInString(strings.TrimSpace(v))
	return n >= 2 && n <= 40
}
func ValidatePassword(v string) error {
	if v == "" {
		return errors.New("密码不能为空")
	}
	return nil
}

// 密码先做固定长度摘要再交给 bcrypt，避免 bcrypt 的 72 字节输入上限
// 限制用户密码长度；前缀用于兼容已有的、未预哈希的 bcrypt 摘要。
const passwordHashPrefix = "sha256$"

func passwordDigest(v string) []byte {
	sum := sha256.Sum256([]byte(v))
	return []byte(hex.EncodeToString(sum[:]))
}

func HashPassword(v string) (string, error) {
	b, e := bcrypt.GenerateFromPassword(passwordDigest(v), bcrypt.DefaultCost)
	if e != nil {
		return "", e
	}
	return passwordHashPrefix + string(b), nil
}
func CheckPassword(hash, v string) bool {
	if strings.HasPrefix(hash, passwordHashPrefix) {
		return bcrypt.CompareHashAndPassword([]byte(strings.TrimPrefix(hash, passwordHashPrefix)), passwordDigest(v)) == nil
	}
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
