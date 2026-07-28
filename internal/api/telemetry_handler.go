// 文件作用：定义遥测查询相关 HTTP Handler 占位。

package api

import (
	"log/slog"
	"net/http"
)

// LatestTelemetryHandler 将从 robot_shadow 返回每台机器人的最新状态。
// 将最新状态查询与历史遥测查询分开。
func LatestTelemetryHandler(log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		log.Debug("latest telemetry endpoint called")
		writeJSON(w, http.StatusNotImplemented, map[string]string{
			"message": "latest telemetry API is not implemented yet",
		})
	}
}
