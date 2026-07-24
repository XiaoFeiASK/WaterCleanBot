package api

import (
	"log/slog"
	"net/http"
)

// RobotsHandler 将从 robots 表返回机器人记录。
// 在仓储层实现前，它有意保持为 501 占位处理器。
func RobotsHandler(log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		log.Debug("robots endpoint called")
		writeJSON(w, http.StatusNotImplemented, map[string]string{
			"message": "robots API is not implemented yet",
		})
	}
}
