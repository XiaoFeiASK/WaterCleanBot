package api

import (
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/config"
)

// NewRouter registers all HTTP routes for the backend template.
func NewRouter(cfg config.Config, store healthStore, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", HealthHandler(store, log))
	mux.HandleFunc("GET /api/robots", RobotsHandler(log))
	mux.HandleFunc("GET /api/telemetry/latest", LatestTelemetryHandler(log))
	// cfg is passed here so future route groups can use environment-aware settings.
	_ = cfg
	return mux
}
