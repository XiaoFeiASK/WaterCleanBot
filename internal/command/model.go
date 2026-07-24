package command

import "time"

// Command records a backend command sent to a robot and its current execution state.
type Command struct {
	ID          string
	RobotCode   string
	Type        string
	Payload     map[string]any
	Status      string
	RequestedBy string
	ExpiresAt   time.Time
	CreatedAt   time.Time
	UpdatedAt   time.Time
}
