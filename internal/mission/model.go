// 文件作用：定义清洁任务、任务航点和任务执行记录的基础模型占位。

package mission

import "time"

// Mission 表示一次计划清洁任务。
type Mission struct {
	ID             string
	RobotID        string
	Name           string
	Status         string
	PlannedStartAt time.Time
	PlannedEndAt   time.Time
}

// Waypoint 表示任务规划路径中的一个航点。
type Waypoint struct {
	ID         string
	MissionID  string
	SequenceNo int
	Latitude   float64
	Longitude  float64
}
