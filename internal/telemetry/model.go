package telemetry

import "time"

// Sample 表示来自机器人的一条历史遥测消息。
// 数据库版本应将 Location 存储为 PostGIS 地理或几何点类型。
type Sample struct {
	RobotCode      string
	BootID         string
	SeqNo          int64
	ReportedAt     time.Time
	Latitude       float64
	Longitude      float64
	BatteryPercent float64
	SpeedMPS       float64
	TrashWeightKG  float64
	SensorData     map[string]any
}
