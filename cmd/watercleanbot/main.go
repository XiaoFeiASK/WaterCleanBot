// 文件作用：启动实时定位后端服务，暴露机器人位置查询接口并运行定位任务。

package main

import (
	"context"
	"database/sql"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	_ "github.com/lib/pq"

	dbmigrations "github.com/XiaoFeiASK/WaterCleanBot/database"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/api"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/config"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/logger"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/routes"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/telemetry"
)

func main() {
	cfg := config.Load()
	log := logger.New(cfg.AppEnv)
	if err := cfg.Validate(); err != nil {
		log.Error("invalid configuration", slog.Any("error", err))
		os.Exit(1)
	}

	appCtx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	db, err := sql.Open("postgres", cfg.DatabaseURL)
	if err != nil {
		log.Error("open database failed", slog.Any("error", err))
		os.Exit(1)
	}
	defer db.Close()

	pingCtx, cancel := context.WithTimeout(appCtx, 5*time.Second)
	if err := db.PingContext(pingCtx); err != nil {
		cancel()
		log.Error("connect database failed", slog.Any("error", err))
		os.Exit(1)
	}
	cancel()

	if err := dbmigrations.Up(appCtx, db); err != nil {
		log.Error("database migration failed", slog.Any("error", err))
		os.Exit(1)
	}
	authRepository := auth.NewRepository(db)
	authService := auth.NewService(authRepository, auth.Config{
		RegistrationEnabled: cfg.AuthRegistrationEnabled,
		CookieSecure:        cfg.AuthCookieSecure,
		AllowedOrigins:      cfg.AuthAllowedOrigins,
		TrustedProxies:      cfg.AuthTrustedProxies,
		SessionDuration:     24 * time.Hour,
		RememberDuration:    30 * 24 * time.Hour,
	}, log)
	if err := authService.InitializeSuperuser(appCtx, cfg.InitialSuperuserUsername, cfg.InitialSuperuserDisplayName, cfg.InitialSuperuserEmail, cfg.InitialSuperuserPassword); err != nil {
		log.Error("initialize superuser failed", slog.Any("error", err))
		os.Exit(1)
	}
	go authService.Cleanup(appCtx)

	locationStore := location.NewStore()
	locationRepository := location.NewRepository(db)
	routeRepository := routes.NewRepository(db)
	if err := routeRepository.EnsureSchema(appCtx); err != nil {
		log.Error("ensure route schema failed", slog.Any("error", err))
		os.Exit(1)
	}
	locationTask := location.NewTask(locationStore, locationRepository, cfg.LocationUpdateInterval, log)
	go locationTask.Start(appCtx)

	telemetrySubscriber := telemetry.NewSubscriber(telemetry.SubscriberConfig{
		BrokerURL:     cfg.MQTTBrokerURL,
		ClientID:      cfg.MQTTClientID,
		Topic:         cfg.MQTTTelemetryTopic,
		FeedbackTopic: cfg.MQTTFeedbackTopic,
		Username:      cfg.MQTTUsername,
		Password:      cfg.MQTTPassword,
	}, locationStore, locationRepository, log)
	if err := telemetrySubscriber.Start(appCtx); err != nil {
		log.Error("start mqtt telemetry subscriber failed", slog.Any("error", err))
	}

	commandPublisher := control.NewPublisher(control.PublisherConfig{
		BrokerURL:             cfg.MQTTBrokerURL,
		ClientID:              cfg.MQTTCommandClientID,
		TopicTemplate:         cfg.MQTTCommandTopic,
		RouteTopicTemplate:    cfg.MQTTRouteTopic,
		FeedbackTopicTemplate: cfg.MQTTFeedbackTopic,
		Username:              cfg.MQTTUsername,
		Password:              cfg.MQTTPassword,
	}, log)
	if err := commandPublisher.Start(appCtx); err != nil {
		log.Error("start mqtt command publisher failed", slog.Any("error", err))
	}
	server := &http.Server{
		Addr:              cfg.HTTPAddr,
		Handler:           api.NewRouter(locationStore, commandPublisher, routeRepository, commandPublisher, api.NewSharedCameraStreams(cfg.CameraHLSBaseURL), authService, log),
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
