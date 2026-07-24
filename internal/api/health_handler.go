package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"
)

// healthStore 描述健康检查端点所需的数据库检查能力。
type healthStore interface {
	Ping(ctx context.Context) error
}

// HealthHandler 报告 HTTP 服务和数据库配置是否可用。
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
