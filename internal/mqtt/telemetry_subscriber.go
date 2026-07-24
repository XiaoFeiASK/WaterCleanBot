package mqtt

import (
	"context"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/telemetry"
)

// TelemetrySubscriber will decode MQTT payloads and pass validated telemetry to the service layer.
type TelemetrySubscriber struct {
	service *telemetry.Service
}

// NewTelemetrySubscriber prepares the future MQTT subscription handler.
func NewTelemetrySubscriber(service *telemetry.Service) *TelemetrySubscriber {
	return &TelemetrySubscriber{service: service}
}

// Start is a placeholder for subscribing to v1/robots/+/telemetry.
func (s *TelemetrySubscriber) Start(_ context.Context) error {
	_ = s.service
	return nil
}
