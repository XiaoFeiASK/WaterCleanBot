package telemetry

import "time"

// Sample represents one historical telemetry message from a robot.
// The database version should store Location as a PostGIS geography/geometry point.
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
