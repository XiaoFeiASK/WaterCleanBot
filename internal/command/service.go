package command

import "context"

// Service coordinates command creation, MQTT publishing, and ACK status updates.
type Service struct {
	repository Repository
}

// NewService creates the command service.
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

// Create validates and stores a command before it is published through MQTT.
func (s *Service) Create(ctx context.Context, command Command) error {
	return s.repository.Create(ctx, command)
}
