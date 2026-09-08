// 文件作用：集中读取服务运行所需环境变量和认证配置。
package config

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	HTTPAddr                    string
	AppEnv                      string
	LocationSnapshotInterval    time.Duration
	DatabaseURL                 string
	MQTTBrokerURL               string
	MQTTClientID                string
	MQTTTelemetryTopic          string
	MQTTCommandClientID         string
	MQTTCommandTopic            string
	MQTTRouteTopic              string
	MQTTFeedbackTopic           string
	MQTTUsername                string
	MQTTPassword                string
	CameraHLSBaseURL            string
	AuthRegistrationEnabled     bool
	AuthCookieSecure            bool
	AuthTrustedProxies          []string
	InitialSuperuserUsername    string
	InitialSuperuserPassword    string
	InitialSuperuserEmail       string
	InitialSuperuserDisplayName string
}

func Load() Config {
	loadDotEnv(".env")
	return Config{
		HTTPAddr: getenv("HTTP_ADDR", ":8080"), AppEnv: getenv("APP_ENV", "local"),
		LocationSnapshotInterval: getDuration("LOCATION_SNAPSHOT_INTERVAL", time.Second),
		DatabaseURL:              getenv("DATABASE_URL", "postgres://waterbot:waterbot_dev_password@localhost:5432/waterbot?sslmode=disable"),
		MQTTBrokerURL:            getenv("MQTT_BROKER_URL", "tcp://localhost:1883"), MQTTClientID: getenv("MQTT_CLIENT_ID", "watercleanbot-backend"),
		MQTTTelemetryTopic: getenv("MQTT_TELEMETRY_TOPIC", "usv/+/telemetry"), MQTTCommandClientID: getenv("MQTT_COMMAND_CLIENT_ID", "watercleanbot-command-publisher"),
		MQTTCommandTopic: getenv("MQTT_COMMAND_TOPIC", "usv/%s/websend"), MQTTRouteTopic: getenv("MQTT_ROUTE_TOPIC", "usv/%s/websend"),
		MQTTFeedbackTopic: getenv("MQTT_FEEDBACK_TOPIC", "usv/+/webfeedback"), MQTTUsername: getenv("MQTT_USERNAME", ""), MQTTPassword: getenv("MQTT_PASSWORD", ""),
		CameraHLSBaseURL:        getenv("CAMERA_HLS_BASE_URL", "http://localhost:8888"),
		AuthRegistrationEnabled: getBool("AUTH_REGISTRATION_ENABLED", true), AuthCookieSecure: getBool("AUTH_COOKIE_SECURE", false),
		AuthTrustedProxies:       getList("AUTH_TRUSTED_PROXIES", nil),
		InitialSuperuserUsername: os.Getenv("INITIAL_SUPERUSER_USERNAME"), InitialSuperuserPassword: os.Getenv("INITIAL_SUPERUSER_PASSWORD"),
		InitialSuperuserEmail: os.Getenv("INITIAL_SUPERUSER_EMAIL"), InitialSuperuserDisplayName: os.Getenv("INITIAL_SUPERUSER_DISPLAY_NAME"),
	}
}
func (c Config) Validate() error {
	if strings.EqualFold(c.AppEnv, "production") && !c.AuthCookieSecure {
		return fmt.Errorf("AUTH_COOKIE_SECURE must be true in production")
	}
	return nil
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
		value = strings.Trim(strings.TrimSpace(value), "\"'")
		_ = os.Setenv(key, value)
	}
}
func getenv(key, fallback string) string {
	if value := os.Getenv(key); value != "" {
		return value
	}
	return fallback
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
func getBool(key string, fallback bool) bool {
	v := os.Getenv(key)
	if v == "" {
		return fallback
	}
	b, e := strconv.ParseBool(v)
	if e != nil {
		return fallback
	}
	return b
}
func getList(key string, fallback []string) []string {
	v := os.Getenv(key)
	if strings.TrimSpace(v) == "" {
		return fallback
	}
	parts := strings.Split(v, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if part = strings.TrimSpace(part); part != "" {
			out = append(out, strings.TrimSuffix(part, "/"))
		}
	}
	return out
}
