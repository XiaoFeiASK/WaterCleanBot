// 文件作用：定义无人船实时遥测数据结构。

package location

// Position 表示一台无人船当前最新遥测数据。
type Position struct {
	RobotName           string         `json:"robotName"`
	Lat                 *float64       `json:"lat"`
	Lng                 *float64       `json:"lng"`
	Heading             *float64       `json:"heading"`
	Speed               *float64       `json:"speed"`
	Battery             *float64       `json:"battery"`
	Status              int            `json:"status"`
	SourceTimestampMS   int64          `json:"sourceTimestampMs,omitempty"`
	ReceivedAtMS        int64          `json:"receivedAtMs,omitempty"`
	HeadingRate         *float64       `json:"headingRate,omitempty"`
	Pitch               *float64       `json:"pitch,omitempty"`
	PitchRate           *float64       `json:"pitchRate,omitempty"`
	Roll                *float64       `json:"roll,omitempty"`
	RollRate            *float64       `json:"rollRate,omitempty"`
	Altitude            *float64       `json:"altitude,omitempty"`
	Heave               *float64       `json:"heave,omitempty"`
	SpeedKnots          *float64       `json:"speedKnots,omitempty"`
	SatelliteCount      *int           `json:"satelliteCount,omitempty"`
	GNSSSolutionStatus  *int           `json:"gnssSolutionStatus,omitempty"`
	DistanceMeters      *float64       `json:"distanceMeters,omitempty"`
	TotalDistanceMeters *float64       `json:"totalDistanceMeters,omitempty"`
	LastDistanceMeters  *float64       `json:"-"`
	HeartbeatStatus     string         `json:"heartbeatStatus,omitempty"`
	HeartbeatLastAckAt  int64          `json:"heartbeatLastAckAt,omitempty"`
	HeartbeatMisses     int            `json:"heartbeatMisses,omitempty"`
	ControlMode         *int           `json:"controlMode,omitempty"`
	CommandResultCode   *int           `json:"commandResultCode,omitempty"`
	LeftThrottle        *int           `json:"leftThrottle,omitempty"`
	RightThrottle       *int           `json:"rightThrottle,omitempty"`
	Actuators           map[string]int `json:"actuators,omitempty"`
	DeviceStatusOK      *bool          `json:"deviceStatusOk,omitempty"`
}

func Float(value float64) *float64 { return &value }
