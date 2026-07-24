package robot

import "context"

// Service owns robot business rules between HTTP handlers and the repository.
type Service struct {
	repository Repository
}

// NewService creates the robot service.
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

// List returns all robots visible to the caller.
func (s *Service) List(ctx context.Context) ([]Robot, error) {
	return s.repository.List(ctx)
}
