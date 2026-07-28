// 文件作用：预留命令创建、发布和 ACK 状态更新的业务逻辑位置。

package command

import "context"

// Service 协调命令创建、MQTT 发布和 ACK 状态更新。
type Service struct {
	repository Repository
}

// NewService 创建命令服务。
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

// Create 在通过 MQTT 发布前校验并存储命令。
func (s *Service) Create(ctx context.Context, command Command) error {
	return s.repository.Create(ctx, command)
}
