// 文件作用：启动实时定位后端服务，暴露机器人位置查询接口并运行定位任务。

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
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/logger"
)

func main() {
	cfg := config.Load()
	log := logger.New(cfg.AppEnv)

	appCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	locationStore := location.NewStore()
	locationTask := location.NewTask(locationStore, cfg.LocationUpdateInterval, log)
	go locationTask.Start(appCtx)

	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewRouter(locationStore, log),
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		log.Info("starting watercleanbot location service", slog.String("addr", cfg.HTTPAddr))
		if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			log.Error("http server stopped unexpectedly", slog.Any("error", err))
			os.Exit(1)
		}
	}()

	<-appCtx.Done()

	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := server.Shutdown(shutdownCtx); err != nil {
		log.Error("graceful shutdown failed", slog.Any("error", err))
		os.Exit(1)
	}
	log.Info("watercleanbot location service stopped")
}
