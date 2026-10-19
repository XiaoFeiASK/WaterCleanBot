package telemetry

import (
	"encoding/json"
	"math"
	"strings"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

const knotsToMetersPerSecond = 0.514444

// ParseNavigationFeedback 解析艇端 [18,P1,...,P13] 导航反馈。
// P1/P2 分别是经度、纬度，P11 是节；Position.Speed 统一换算为米/秒。
func ParseNavigationFeedback(topic string, payload []byte) (location.Position, bool) {
	robotName, ok := feedbackRobotName(topic)
	if !ok {
		return location.Position{}, false
	}

	var numbers []json.Number
	if err := json.Unmarshal(payload, &numbers); err != nil || len(numbers) != 14 {
		return location.Position{}, false
	}
	values := make([]float64, len(numbers))
	for index, number := range numbers {
		value, err := number.Float64()
		if err != nil || math.IsNaN(value) || math.IsInf(value, 0) {
			return location.Position{}, false
		}
		values[index] = value
	}
	if values[0] != 18 {
		return location.Position{}, false
	}

	lng, lat, heading, speedKnots := values[1], values[2], values[3], values[11]
	if lng < -180 || lng > 180 || lat < -90 || lat > 90 || heading < 0 || heading > 360 || speedKnots < 0 {
		return location.Position{}, false
	}
	if values[12] < 0 || values[12] != math.Trunc(values[12]) || values[13] != math.Trunc(values[13]) {
		return location.Position{}, false
	}
	solutionStatus := int(values[13])
	if solutionStatus != 0 && solutionStatus != 1 && solutionStatus != 2 && solutionStatus != 4 && solutionStatus != 5 {
		return location.Position{}, false
	}

	headingRate, pitch, pitchRate := values[4], values[5], values[6]
	roll, rollRate, altitude, heave := values[7], values[8], values[9], values[10]
	satelliteCount := int(values[12])
	return location.Position{
		RobotName:          robotName,
		Lng:                location.Float(lng),
		Lat:                location.Float(lat),
		Heading:            location.Float(heading),
		Speed:              location.Float(speedKnots * knotsToMetersPerSecond),
		HeadingRate:        &headingRate,
		Pitch:              &pitch,
		PitchRate:          &pitchRate,
		Roll:               &roll,
		RollRate:           &rollRate,
		Altitude:           &altitude,
		Heave:              &heave,
		SpeedKnots:         &speedKnots,
		SatelliteCount:     &satelliteCount,
		GNSSSolutionStatus: &solutionStatus,
	}, true
}

func feedbackRobotName(topic string) (string, bool) {
	parts := strings.Split(topic, "/")
	if len(parts) != 3 || parts[0] != "usv" || parts[1] == "" || parts[2] != "webfeedback" {
		return "", false
	}
	return parts[1], true
}

func ParseStatusFeedback(topic string, payload []byte) (string, location.Position, bool) {
	robotName, ok := feedbackRobotName(topic)
	if !ok {
		return "", location.Position{}, false
	}
	var v []int
	if err := json.Unmarshal(payload, &v); err != nil || len(v) == 0 {
		return "", location.Position{}, false
	}
	p := location.Position{RobotName: robotName}
	switch v[0] {
	case 17:
		if len(v) < 5 || v[4] < 0 || v[4] > 2 {
			return "", location.Position{}, false
		}
		result, mode := v[2], v[4]
		p.CommandResultCode = &result
		p.ControlMode = &mode
	case 20:
		if len(v) < 8 {
			return "", location.Position{}, false
		}
		names := []string{"leftBrush", "rightBrush", "conveyor", "paddlePower", "discCylinder", "hatchCylinder"}
		p.Actuators = map[string]int{}
		for i, n := range names {
			if v[i+1] != 0 && v[i+1] != 1 {
				return "", location.Position{}, false
			}
			p.Actuators[n] = v[i+1]
		}
		ok := v[7] == 1
		p.DeviceStatusOK = &ok
	case 21:
		if len(v) < 4 || v[1] < 0 || v[1] > 100 || v[2] < -100 || v[2] > 100 || v[3] < -100 || v[3] > 100 {
			return "", location.Position{}, false
		}
		battery, left, right := float64(v[1]), v[2], v[3]
		p.Battery = &battery
		p.LeftThrottle = &left
		p.RightThrottle = &right
	default:
		return "", location.Position{}, false
	}
	return robotName, p, true
}
