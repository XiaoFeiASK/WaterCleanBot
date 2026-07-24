package api

import (
	"log/slog"
	"net/http"
)

// RobotsHandler will return robot records from the robots table.
// It is intentionally a 501 placeholder until the repository layer is implemented.
func RobotsHandler(log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		log.Debug("robots endpoint called")
		writeJSON(w, http.StatusNotImplemented, map[string]string{
			"message": "robots API is not implemented yet",
		})
	}
}
