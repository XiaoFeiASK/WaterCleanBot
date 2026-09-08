package auth

import "time"

const (
	RoleUser      = "user"
	RoleSuperuser = "superuser"
	RoleAdmin     = "admin"
)

// RoleLevel returns the permission level in ascending order:
// ordinary user < superuser < administrator. Unknown roles have no permissions.
func RoleLevel(role string) int {
	switch role {
	case RoleUser:
		return 1
	case RoleSuperuser:
		return 2
	case RoleAdmin:
		return 3
	default:
		return 0
	}
}

func IsValidRole(role string) bool {
	return RoleLevel(role) > 0
}

func HasMinimumRole(role, minimum string) bool {
	minimumLevel := RoleLevel(minimum)
	return minimumLevel > 0 && RoleLevel(role) >= minimumLevel
}

type User struct {
	ID           string     `json:"id"`
	Username     string     `json:"username"`
	DisplayName  string     `json:"displayName"`
	Email        string     `json:"email"`
	Role         string     `json:"role"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
	LastLoginAt  *time.Time `json:"lastLoginAt,omitempty"`
	PasswordHash string     `json:"-"`
}

type Session struct {
	ID         string
	UserID     string
	TokenHash  string
	ExpiresAt  time.Time
	RememberMe bool
}

type PublicConfig struct {
	RegistrationEnabled bool `json:"registrationEnabled"`
}
