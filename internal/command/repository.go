package command

import "context"

// Repository will store commands and update acknowledgement results.
type Repository interface {
	Create(ctx context.Context, command Command) error
	MarkAcknowledged(ctx context.Context, commandID string) error
	MarkFailed(ctx context.Context, commandID string, reason string) error
}
