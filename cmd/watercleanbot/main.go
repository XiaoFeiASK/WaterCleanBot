// 文件作用：作为 Go 后端服务启动入口，组装配置、日志、数据库和 HTTP 路由。

package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/api"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/config"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/db"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/logger"
)

// main 组装首个后端模板。
// 真实数据库和 MQTT 实现后续会接入这些包中。
func main() {
	cfg := config.Load()
	log := logger.New(cfg.AppEnv)
	store := db.NewPostgresStore(cfg.DatabaseURL)

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewRouter(cfg, store, log),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Info("starting watercleanbot backend", slog.String("addr", cfg.HTTPAddr))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server stopped unexpectedly", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	shutdownCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	<-shutdownCtx.Done()

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(ctx); err != nil {
		log.Error("graceful shutdown failed", slog.Any("error", err))
		os.Exit(1)
	}
	log.Info("watercleanbot backend stopped")
}
