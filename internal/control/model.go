// 文件作用：定义遥控指令请求、MQTT 下发报文，并集中校验遥控参数。

package control

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	// CommandTypeRemoteControl 标识艇端需要按遥控目标状态执行。
	CommandTypeRemoteControl = "REMOTE_CONTROL"

	// DefaultTTLMS 是遥控指令默认有效期，避免艇端执行过期命令。
	DefaultTTLMS = 800
	MaxTTLMS     = 5000

	HeartbeatInterval = 500 * time.Millisecond
)

var commandRanges = map[string]struct{ min, max int }{
	"THROTTLE_L":     {-100, 100},
	"THROTTLE_R":     {-100, 100},
	"HATCH_CYLINDER": {0, 1},
	"DISC_CYLINDER":  {0, 1},
	"CONVEYOR":       {0, 1},
	"BRUSH_L":        {0, 1},
	"BRUSH_R":        {0, 1},
	"OPERATING_MODE": {0, 1},
	"CLEANING":       {0, 1},
	"TRACKING":       {0, 1},
	"PADDLE_POWER":   {0, 1},
}

var parameterlessCommands = map[string]DeviceCommandPayload{
	"HEARTBEAT":  {17},
	"STOP":       {23},
	"DOCK_EJECT": {0xEA, 0x01, 0xEB},
}

// ValidationError 表示请求本身非法，调用方应返回 400 而不是重试发布。
type ValidationError struct {
	Err error
}

func (e ValidationError) Error() string {
	return e.Err.Error()
}

func (e ValidationError) Unwrap() error {
	return e.Err
}

// IsValidationError 判断错误是否由非法遥控请求引起。
func IsValidationError(err error) bool {
	var validationError ValidationError
	return errors.As(err, &validationError)
}

// RemoteCommandRequest 是前端提交给后端的遥控指令请求。
type RemoteCommandRequest struct {
	Command string         `json:"command"`
	Value   int            `json:"value"`
	Values  map[string]int `json:"values"`
	TTLMS   int            `json:"ttlMs"`
}

// RemoteCommandEnvelope 是后端内部使用的指令信封，保留 commandId/seq 便于 HTTP 响应和日志追踪。
type RemoteCommandEnvelope struct {
	CommandID string         `json:"commandId"`
	Target    string         `json:"target"`
	Type      string         `json:"type"`
	Seq       uint64         `json:"seq"`
	IssuedAt  int64          `json:"issuedAt"`
	TTLMS     int            `json:"ttlMs"`
	Command   string         `json:"command"`
	Value     int            `json:"value"`
	Values    map[string]int `json:"values"`
}

// DeviceCommandPayload 是艇端 IF_CC2IIP 协议要求的数字载荷。
type DeviceCommandPayload []int

// DevicePayload 把语义化指令编码成艇端协议数组。
func (e RemoteCommandEnvelope) DevicePayload() DeviceCommandPayload {
	if payload, ok := parameterlessCommands[e.Command]; ok {
		return append(DeviceCommandPayload(nil), payload...)
	}

	switch e.Command {
	case "OPERATING_MODE":
		return DeviceCommandPayload{20, e.Value}
	case "TRACKING":
		// 0x18：1 开始按航线循迹，0 停止循迹。
		return DeviceCommandPayload{24, e.Value}
	case "CLEANING":
		return DeviceCommandPayload{38, e.Value}
	case "THROTTLE_L":
		return DeviceCommandPayload{39, 0, e.Value}
	case "THROTTLE_R":
		return DeviceCommandPayload{39, 1, e.Value}
	case "BRUSH_L":
		return DeviceCommandPayload{36, 1, e.Value}
	case "BRUSH_R":
		return DeviceCommandPayload{36, 2, e.Value}
	case "CONVEYOR":
		return DeviceCommandPayload{36, 3, e.Value}
	case "PADDLE_POWER":
		return DeviceCommandPayload{36, 4, e.Value}
	case "DISC_CYLINDER":
		return DeviceCommandPayload{36, 5, e.Value}
	case "HATCH_CYLINDER":
		return DeviceCommandPayload{36, 6, e.Value}
	default:
		return nil
	}
}

// BuildRemoteCommand 校验前端请求，并封装成可发给艇端的 MQTT 报文。
func BuildRemoteCommand(target string, seq uint64, request RemoteCommandRequest) (RemoteCommandEnvelope, error) {
	target = strings.TrimSpace(target)
	if err := ValidateTarget(target); err != nil {
		return RemoteCommandEnvelope{}, ValidationError{Err: err}
	}

	normalizedRequest, err := normalizeRequest(request)
	if err != nil {
		return RemoteCommandEnvelope{}, ValidationError{Err: err}
	}

	commandID, err := newCommandID()
	if err != nil {
		return RemoteCommandEnvelope{}, err
	}

	return RemoteCommandEnvelope{
		CommandID: commandID,
		Target:    target,
		Type:      CommandTypeRemoteControl,
		Seq:       seq,
		IssuedAt:  time.Now().UnixMilli(),
		TTLMS:     normalizedRequest.TTLMS,
		Command:   normalizedRequest.Command,
		Value:     normalizedRequest.Value,
		Values:    normalizedRequest.Values,
	}, nil
}

// ValidateTarget 限制 MQTT topic 中的设备名，避免 topic 注入。
func ValidateTarget(target string) error {
	if target == "" {
		return errors.New("robot name is required")
	}
	if strings.ContainsAny(target, "/+#") {
		return fmt.Errorf("robot name contains mqtt topic separator or wildcard: %q", target)
	}
	return nil
}

func normalizeRequest(request RemoteCommandRequest) (RemoteCommandRequest, error) {
	command := strings.TrimSpace(request.Command)
	if command == "" {
		return RemoteCommandRequest{}, errors.New("command is required")
	}
	_, isParameterless := parameterlessCommands[command]
	if _, ok := commandRanges[command]; !ok && !isParameterless {
		return RemoteCommandRequest{}, fmt.Errorf("unsupported command: %s", command)
	}

	if isParameterless {
		if request.Value != 0 {
			return RemoteCommandRequest{}, fmt.Errorf("%s value must be 0", command)
		}
		request.Values = nil
	} else {
		values, err := normalizeValues(request.Values)
		if err != nil {
			return RemoteCommandRequest{}, err
		}
		request.Values = values
	}

	if !isParameterless && request.Values[command] != request.Value {
		return RemoteCommandRequest{}, fmt.Errorf("command value does not match values[%s]", command)
	}

	ttlMS := request.TTLMS
	if ttlMS <= 0 {
		ttlMS = DefaultTTLMS
	}
	if ttlMS > MaxTTLMS {
		return RemoteCommandRequest{}, fmt.Errorf("ttlMs exceeds %d", MaxTTLMS)
	}

	return RemoteCommandRequest{
		Command: command,
		Value:   request.Value,
		Values:  request.Values,
		TTLMS:   ttlMS,
	}, nil
}

func normalizeValues(values map[string]int) (map[string]int, error) {
	if values == nil {
		return nil, errors.New("values are required")
	}

	normalized := make(map[string]int, len(commandRanges))
	for command, commandRange := range commandRanges {
		value := values[command]
		if value < commandRange.min || value > commandRange.max {
			return nil, fmt.Errorf("values.%s out of range", command)
		}
		normalized[command] = value
	}

	for command := range values {
		if _, ok := commandRanges[command]; !ok {
			return nil, fmt.Errorf("unsupported values field: %s", command)
		}
	}

	return normalized, nil
}

func newCommandID() (string, error) {
	var randomBytes [8]byte
	if _, err := rand.Read(randomBytes[:]); err != nil {
		return "", fmt.Errorf("generate command id: %w", err)
	}
	return fmt.Sprintf("cmd-%d-%s", time.Now().UnixMilli(), hex.EncodeToString(randomBytes[:])), nil
}
