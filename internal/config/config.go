// 文件作用：集中读取实时定位服务运行所需环境变量和默认配置。

package config

import (
	"os"
	"time"
)

// Config 包含当前最小后端需要的运行配置。
type Config struct {
	HTTPAddr               string
	AppEnv                 string
	LocationUpdateInterval time.Duration
}

// Load 从环境变量读取配置，并应用本地开发默认值。
func Load() Config {
	return Config{
		HTTPAddr:               getenv("HTTP_ADDR", ":8080"),
		AppEnv:                 getenv("APP_ENV", "local"),
		LocationUpdateInterval: getDuration("LOCATION_UPDATE_INTERVAL", 5*time.Second),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}

func getDuration(key string, fallback time.Duration) time.Duration {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	duration, err := time.ParseDuration(value)
	if err != nil {
		return fallback
	}
	return duration
}
