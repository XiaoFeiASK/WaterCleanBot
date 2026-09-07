package telemetry

import (
    "encoding/json"
    "strings"
    "github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

func ParseStatusFeedback(topic string, payload []byte) (string, location.Position, bool) {
    parts := strings.Split(topic, "/")
    if len(parts) != 3 || parts[0] != "usv" || parts[1] == "" || parts[2] != "webfeedback" { return "", location.Position{}, false }
    var v []int
    if err := json.Unmarshal(payload, &v); err != nil || len(v) == 0 { return "", location.Position{}, false }
    p := location.Position{RobotName: parts[1]}
    switch v[0] {
    case 17:
        if len(v) < 5 || v[4] < 0 || v[4] > 2 { return "", location.Position{}, false }
        result, mode := v[2], v[4]; p.CommandResultCode = &result; p.ControlMode = &mode
    case 20:
        if len(v) < 8 { return "", location.Position{}, false }
        names := []string{"leftBrush", "rightBrush", "conveyor", "paddlePower", "discCylinder", "hatchCylinder"}
        p.Actuators = map[string]int{}
        for i, n := range names { if v[i+1] != 0 && v[i+1] != 1 { return "", location.Position{}, false }; p.Actuators[n] = v[i+1] }
        ok := v[7] == 1; p.DeviceStatusOK = &ok
    case 21:
        if len(v) < 4 || v[1] < 0 || v[1] > 100 || v[2] < -100 || v[2] > 100 || v[3] < -100 || v[3] > 100 { return "", location.Position{}, false }
        battery, left, right := float64(v[1]), v[2], v[3]; p.Battery = battery; p.LeftThrottle = &left; p.RightThrottle = &right
    default:
        return "", location.Position{}, false
    }
    return parts[1], p, true
}
