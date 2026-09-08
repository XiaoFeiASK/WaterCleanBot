package api

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
)

func TestAllowOrigin(t *testing.T) {
	h := NewAuthHandler(auth.NewService(nil, auth.Config{AllowedOrigins: []string{"http://localhost:5175"}}, slog.New(slog.NewTextHandler(os.Stderr, nil))), slog.Default())
	tests := []struct {
		name, origin, fetch string
		required, want      bool
	}{{"allowed", "http://localhost:5175", "cross-site", true, true}, {"cross site", "http://evil.test", "cross-site", true, false}, {"same origin fetch", "", "same-origin", true, true}, {"non browser login", "", "", false, true}, {"missing authenticated origin", "", "", true, false}}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			r := httptest.NewRequest(http.MethodPost, "http://localhost/api/auth/logout", nil)
			if tt.origin != "" {
				r.Header.Set("Origin", tt.origin)
			}
			if tt.fetch != "" {
				r.Header.Set("Sec-Fetch-Site", tt.fetch)
			}
			if got := h.allowOrigin(r, tt.required); got != tt.want {
				t.Fatalf("allowOrigin=%v want %v", got, tt.want)
			}
		})
	}
}
