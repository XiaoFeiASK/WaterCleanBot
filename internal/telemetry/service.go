package telemetry

import "context"

// Repository 定义遥测接入所需的数据库操作。
// 真实实现应在一个事务中插入 telemetry_samples 并写入或更新 robot_shadow。
type Repository interface {
	SaveSample(ctx context.Context, sample Sample) error
}

// Service 协调遥测校验和持久化。
type Service struct {
	repository Repository
}

// NewService 创建遥测服务。
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

// Ingest 校验并存储一条遥测样本。
func (s *Service) Ingest(ctx context.Context, sample Sample) error {
	if err := ValidateSample(sample); err != nil {
		return err
	}
	if s.repository == nil {
		return nil
	}
	return s.repository.SaveSample(ctx, sample)
}
