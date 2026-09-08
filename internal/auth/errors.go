package auth

import "errors"

var (
	ErrInvalidCredentials   = errors.New("invalid credentials")
	ErrUnauthenticated      = errors.New("unauthenticated")
	ErrDisabled             = errors.New("account disabled")
	ErrRateLimited          = errors.New("rate limited")
	ErrRegistrationDisabled = errors.New("registration disabled")
)

type ValidationError struct{ Fields map[string]string }

func (e *ValidationError) Error() string { return "validation failed" }
