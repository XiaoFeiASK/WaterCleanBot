package robot

import "time"

// Robot is the backend's basic record for one physical cleaning robot.
type Robot struct {
	ID        string
	Code      string
	Model     string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}
