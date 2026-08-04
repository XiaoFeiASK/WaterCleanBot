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
)

var commandRanges = map[string]struct{ min, max int }{
	"THROTTLE_L":     {-100, 100},
	"THROTTLE_R":     {-100, 100},
	"HATCH_CYLINDER": {0, 1},
	"DISC_CYLINDER":  {0, 1},
	"CONVEYOR":       {0, 1},
	"BRUSH_L":        {0, 1},
	"BRUSH_R":        {0, 1},
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

// RemoteCommandEnvelope 是后端发布给艇端 MQTT topic 的标准指令报文。
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
	if command != "TURN_OFF" {
		if _, ok := commandRanges[command]; !ok {
			return RemoteCommandRequest{}, fmt.Errorf("unsupported command: %s", command)
		}
	}

	values, err := normalizeValues(request.Values)
	if err != nil {
		return RemoteCommandRequest{}, err
	}

	if command == "TURN_OFF" {
		if request.Value != 0 {
			return RemoteCommandRequest{}, errors.New("TURN_OFF value must be 0")
		}
		for key, value := range values {
			if value != 0 {
				return RemoteCommandRequest{}, fmt.Errorf("TURN_OFF requires %s to be 0", key)
			}
		}
	} else if values[command] != request.Value {
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
		Values:  values,
		TTLMS:   ttlMS,
	}, nil
}

func normalizeValues(values map[string]int) (map[string]int, error) {
	if values == nil {
		return nil, errors.New("values are required")
	}

	normalized := make(map[string]int, len(commandRanges))
	for command, commandRange := range commandRanges {
		value, ok := values[command]
		if !ok {
			return nil, fmt.Errorf("values.%s is required", command)
		}
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
