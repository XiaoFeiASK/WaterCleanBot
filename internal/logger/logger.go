package logger

import (
	"log/slog"
	"os"
)

// New 创建进程日志器。
// 本地输出保持可读，非本地环境使用结构化 JSON。
func New(appEnv string) *slog.Logger {
	if appEnv == "local" {
		return slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelDebug}))
	}
	return slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo}))
}
