// 文件作用：定义无人船实时遥测数据结构。

package location

// Position 表示一台无人船当前最新遥测数据。
type Position struct {
	RobotName          string  `json:"robotName"`
	Lat                float64 `json:"lat"`
	Lng                float64 `json:"lng"`
	Heading            float64 `json:"heading"`
	Speed              float64 `json:"speed"`
	Battery            float64 `json:"battery"`
	Status             int     `json:"status"`
	DistanceMeters     float64 `json:"distanceMeters"`
	HeartbeatStatus    string  `json:"heartbeatStatus,omitempty"`
	HeartbeatLastAckAt int64   `json:"heartbeatLastAckAt,omitempty"`
	HeartbeatMisses    int     `json:"heartbeatMisses,omitempty"`
}
