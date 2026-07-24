package api

import (
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/config"
)

// NewRouter 注册后端模板的所有 HTTP 路由。
func NewRouter(cfg config.Config, store healthStore, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", HealthHandler(store, log))
	mux.HandleFunc("GET /api/robots", RobotsHandler(log))
	mux.HandleFunc("GET /api/telemetry/latest", LatestTelemetryHandler(log))
	// 传入 cfg，便于未来路由组使用与环境相关的设置。
	_ = cfg
	return mux
}
