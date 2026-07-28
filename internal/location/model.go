// 文件作用：定义机器人实时位置的数据结构。

package location

import "time"

// Position 表示一台机器人当前最新定位。
type Position struct {
	RobotCode string    `json:"robot_code"`
	Latitude  float64   `json:"latitude"`
	Longitude float64   `json:"longitude"`
	SpeedMPS  float64   `json:"speed_mps"`
	Heading   float64   `json:"heading"`
	UpdatedAt time.Time `json:"updated_at"`
}
