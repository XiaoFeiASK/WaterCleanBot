package logger

import (
	"log/slog"
	"os"
)

// New creates the process logger.
// Local output stays readable, while non-local environments use structured JSON.
func New(appEnv string) *slog.Logger {
	if appEnv == "local" {
		return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
}
