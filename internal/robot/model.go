package robot

import "time"

// Robot 是后端中一台实体清洁机器人的基础记录。
type Robot struct {
	ID        string
	Code      string
	Model     string
	Status    string
	CreatedAt time.Time
	UpdatedAt time.Time
}
