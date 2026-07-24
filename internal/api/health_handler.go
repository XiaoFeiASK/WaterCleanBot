package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// healthStore describes the database check required by the health endpoint.
type healthStore interface {
	Ping(ctx context.Context) error
}

// HealthHandler reports whether the HTTP service and database configuration are usable.
func HealthHandler(store healthStore, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
		defer cancel()

		if err := store.Ping(ctx); err != nil {
			log.Warn("health check failed", slog.Any("error", err))
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"status": "unhealthy",
				"error":  err.Error(),
			})
			return
		}

		writeJSON(w, http.StatusOK, map[string]string{
			"status": "ok",
		})
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
