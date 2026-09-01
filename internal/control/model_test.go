package control

import (
	"encoding/json"
	"testing"
)

func TestBuildRemoteCommandAcceptsValidThrottleCommand(t *testing.T) {
	command, err := BuildRemoteCommand("清澜一号", 7, RemoteCommandRequest{
		Command: "THROTTLE_L",
		Value:   30,
		Values: map[string]int{
			"THROTTLE_L":     30,
			"THROTTLE_R":     0,
			"HATCH_CYLINDER": 0,
			"DISC_CYLINDER":  0,
			"CONVEYOR":       0,
			"BRUSH_L":        0,
			"BRUSH_R":        0,
		},
	})
	if err != nil {
		t.Fatalf("BuildRemoteCommand() error = %v", err)
	}
	if command.Target != "清澜一号" || command.Seq != 7 || command.TTLMS != DefaultTTLMS {
		t.Fatalf("unexpected command envelope: %+v", command)
	}
}

func TestDevicePayloadMatchesUSVCommandProtocol(t *testing.T) {
	command, err := BuildRemoteCommand("USV-001", 7, RemoteCommandRequest{
		Command: "THROTTLE_L",
		Value:   30,
		Values: map[string]int{
			"THROTTLE_L":     30,
			"THROTTLE_R":     0,
			"HATCH_CYLINDER": 0,
			"DISC_CYLINDER":  0,
			"CONVEYOR":       0,
			"BRUSH_L":        0,
			"BRUSH_R":        0,
		},
	})
	if err != nil {
		t.Fatalf("BuildRemoteCommand() error = %v", err)
	}

	payload, err := json.Marshal(command.DevicePayload())
	if err != nil {
		t.Fatalf("json.Marshal(DevicePayload()) error = %v", err)
	}

	var decoded []int
	if err := json.Unmarshal(payload, &decoded); err != nil {
		t.Fatalf("json.Unmarshal(payload) error = %v", err)
	}
	if len(decoded) != 3 || decoded[0] != 39 || decoded[1] != 0 || decoded[2] != 30 {
		t.Fatalf("payload = %s, want [39,0,30]", payload)
	}
}

func TestBuildRemoteCommandRejectsOutOfRangeThrottle(t *testing.T) {
	_, err := BuildRemoteCommand("清澜一号", 1, RemoteCommandRequest{
		Command: "THROTTLE_L",
		Value:   101,
		Values: map[string]int{
			"THROTTLE_L":     101,
			"THROTTLE_R":     0,
			"HATCH_CYLINDER": 0,
			"DISC_CYLINDER":  0,
			"CONVEYOR":       0,
			"BRUSH_L":        0,
			"BRUSH_R":        0,
		},
	})
	if !IsValidationError(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
}

func TestBuildRemoteCommandRejectsTopicWildcardsInTarget(t *testing.T) {
	_, err := BuildRemoteCommand("usv/+", 1, RemoteCommandRequest{
		Command: "THROTTLE_L",
		Value:   0,
		Values: map[string]int{
			"THROTTLE_L":     0,
			"THROTTLE_R":     0,
			"HATCH_CYLINDER": 0,
			"DISC_CYLINDER":  0,
			"CONVEYOR":       0,
			"BRUSH_L":        0,
			"BRUSH_R":        0,
		},
	})
	if !IsValidationError(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
}

func TestBuildRemoteCommandRequiresTurnOffValuesToBeZero(t *testing.T) {
	_, err := BuildRemoteCommand("清澜一号", 1, RemoteCommandRequest{
		Command: "TURN_OFF",
		Value:   0,
		Values: map[string]int{
			"THROTTLE_L":     0,
			"THROTTLE_R":     0,
			"HATCH_CYLINDER": 0,
			"DISC_CYLINDER":  0,
			"CONVEYOR":       1,
			"BRUSH_L":        0,
			"BRUSH_R":        0,
		},
	})
	if !IsValidationError(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
}
