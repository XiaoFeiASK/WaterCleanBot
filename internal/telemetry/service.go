package telemetry

import "context"

// Repository defines the database operations needed for telemetry ingestion.
// The real implementation should insert telemetry_samples and upsert robot_shadow in one transaction.
type Repository interface {
	SaveSample(ctx context.Context, sample Sample) error
}

// Service coordinates telemetry validation and persistence.
type Service struct {
	repository Repository
}

// NewService creates the telemetry service.
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}

// Ingest validates and stores one telemetry sample.
func (s *Service) Ingest(ctx context.Context, sample Sample) error {
	if err := ValidateSample(sample); err != nil {
		return err
	}
	if s.repository == nil {
		return nil
	}
	return s.repository.SaveSample(ctx, sample)
}
