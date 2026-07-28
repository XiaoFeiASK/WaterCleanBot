// 文件作用：定义机器人告警和规则相关的基础模型占位。

package alarm

import "time"

// Alarm 表示机器人、任务或水域触发的一条告警事件。
type Alarm struct {
	ID        string
	RobotID   string
	MissionID string
	Level     string
	Type      string
	Message   string
	Status    string
	RaisedAt  time.Time
}
