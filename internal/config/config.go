// 文件作用：集中读取实时定位服务运行所需环境变量和默认配置。

package config

import (
	"bufio"
	"os"
	"strings"
	"time"
)

// Config 包含当前最小后端需要的运行配置。
type Config struct {
	HTTPAddr               string
	AppEnv                 string
	LocationUpdateInterval time.Duration
	DatabaseURL            string
	MQTTBrokerURL          string
	MQTTClientID           string
	MQTTTelemetryTopic     string
	MQTTCommandClientID    string
	MQTTCommandTopic       string
	MQTTRouteTopic         string
	MQTTFeedbackTopic      string
	MQTTUsername           string
	MQTTPassword           string
	CameraHLSBaseURL       string
}

// Load 从 .env 和环境变量读取配置，并应用本地开发默认值。
func Load() Config {
	loadDotEnv(".env")

	return Config{
		HTTPAddr:               getenv("HTTP_ADDR", ":8080"),
		AppEnv:                 getenv("APP_ENV", "local"),
		LocationUpdateInterval: getDuration("LOCATION_UPDATE_INTERVAL", 5*time.Second),
		DatabaseURL:            getenv("DATABASE_URL", "postgres://waterbot:waterbot_dev_password@localhost:5432/waterbot?sslmode=disable"),
		MQTTBrokerURL:          getenv("MQTT_BROKER_URL", "tcp://localhost:1883"),
		MQTTClientID:           getenv("MQTT_CLIENT_ID", "watercleanbot-backend"),
		MQTTTelemetryTopic:     getenv("MQTT_TELEMETRY_TOPIC", "usv/+/telemetry"),
		MQTTCommandClientID:    getenv("MQTT_COMMAND_CLIENT_ID", "watercleanbot-command-publisher"),
		MQTTCommandTopic:       getenv("MQTT_COMMAND_TOPIC", "usv/%s/websend"),
		MQTTRouteTopic:         getenv("MQTT_ROUTE_TOPIC", "usv/%s/websend"),
		MQTTFeedbackTopic:      getenv("MQTT_FEEDBACK_TOPIC", "usv/+/webfeedback"),
		MQTTUsername:           getenv("MQTT_USERNAME", ""),
		MQTTPassword:           getenv("MQTT_PASSWORD", ""),
		CameraHLSBaseURL:       getenv("CAMERA_HLS_BASE_URL", "http://localhost:8888"),
	}
}

func loadDotEnv(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}

		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}

		key = strings.TrimSpace(key)
		if key == "" || os.Getenv(key) != "" {
			continue
		}

		value = strings.TrimSpace(value)
		value = strings.Trim(value, "\"'")
		_ = os.Setenv(key, value)
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
