package config

import "os"

// Config 包含从环境变量读取的运行时设置。
// 保持此包简单且显式，便于审计预发/生产配置。
type Config struct {
	HTTPAddr           string
	DatabaseURL        string
	MQTTBrokerURL      string
	MQTTTelemetryTopic string
	AppEnv             string
}

// Load 从环境读取配置，并应用安全的本地默认值。
func Load() Config {
	return Config{
		HTTPAddr:           getenv("HTTP_ADDR", ":8080"),
		DatabaseURL:        getenv("DATABASE_URL", "postgres://waterbot:waterbot_dev_password@localhost:5432/waterbot?sslmode=disable"),
		MQTTBrokerURL:      getenv("MQTT_BROKER_URL", "tcp://localhost:1883"),
		MQTTTelemetryTopic: getenv("MQTT_TELEMETRY_TOPIC", "v1/robots/+/telemetry"),
		AppEnv:             getenv("APP_ENV", "local"),
	}
}

func getenv(key string, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	return value
}
