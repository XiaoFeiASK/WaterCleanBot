// 文件作用：预留 MQTT 遥测订阅和消息分发位置。

package mqtt

import (
	"context"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/telemetry"
)

// TelemetrySubscriber 将解码 MQTT 载荷并把通过校验的遥测传递给服务层。
type TelemetrySubscriber struct {
	service *telemetry.Service
}

// NewTelemetrySubscriber 准备未来的 MQTT 订阅处理器。
func NewTelemetrySubscriber(service *telemetry.Service) *TelemetrySubscriber {
	return &TelemetrySubscriber{service: service}
}

// Start 是订阅 v1/robots/+/telemetry 的占位实现。
func (s *TelemetrySubscriber) Start(_ context.Context) error {
	_ = s.service
	return nil
}
