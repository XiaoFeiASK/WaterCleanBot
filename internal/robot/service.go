// 文件作用：预留机器人业务逻辑位置。

package robot

import "context"

// Service 管理 HTTP 处理器和仓储层之间的机器人业务规则。
type Service struct {
	repository Repository
}

// NewService 创建机器人服务。
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

// List 返回调用方可见的所有机器人。
func (s *Service) List(ctx context.Context) ([]Robot, error) {
	return s.repository.List(ctx)
}
