package config

import "os"

// Config contains runtime settings read from environment variables.
// Keep this package boring and explicit so staging/production are easy to audit.
type Config struct {
	HTTPAddr           string
	DatabaseURL        string
	MQTTBrokerURL      string
	MQTTTelemetryTopic string
	AppEnv             string
}

// Load reads configuration from the environment and applies safe local defaults.
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
