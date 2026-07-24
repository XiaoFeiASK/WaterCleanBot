package telemetry

import "errors"

// ValidateSample protects the database from malformed robot telemetry.
// Keep validation close to the telemetry model so MQTT and HTTP ingestion share the same rules.
func ValidateSample(sample Sample) error {
	if sample.RobotCode == "" {
		return errors.New("robot code is required")
	}
	if sample.BootID == "" {
		return errors.New("boot id is required")
	}
	if sample.SeqNo < 0 {
		return errors.New("seq_no must be non-negative")
	}
	if sample.Latitude < -90 || sample.Latitude > 90 {
		return errors.New("latitude is out of range")
	}
	if sample.Longitude < -180 || sample.Longitude > 180 {
		return errors.New("longitude is out of range")
	}
	if sample.BatteryPercent < 0 || sample.BatteryPercent > 100 {
		return errors.New("battery_percent is out of range")
	}
	return nil
}
