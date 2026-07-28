// 文件作用：定义遥测数据入库前的基础校验规则。

package telemetry

import "errors"

// ValidateSample 保护数据库免受畸形机器人遥测影响。
// 将校验靠近遥测模型，便于 MQTT 和 HTTP 接入共享相同规则。
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
