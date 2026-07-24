package command

import "time"

// Command 记录后端发送给机器人的命令及其当前执行状态。
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
