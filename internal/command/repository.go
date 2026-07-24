package command

import "context"

// Repository 将存储命令并更新确认结果。
type Repository interface {
	Create(ctx context.Context, command Command) error
	MarkAcknowledged(ctx context.Context, commandID string) error
	MarkFailed(ctx context.Context, commandID string, reason string) error
}
