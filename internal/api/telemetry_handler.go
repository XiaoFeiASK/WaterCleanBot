package api

import (
	"log/slog"
	"net/http"
)

// LatestTelemetryHandler will return each robot's latest state from robot_shadow.
// Keep latest-state queries separate from historical telemetry queries.
func LatestTelemetryHandler(log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		log.Debug("latest telemetry endpoint called")
		writeJSON(w, http.StatusNotImplemented, map[string]string{
			"message": "latest telemetry API is not implemented yet",
		})
	}
}
