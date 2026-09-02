package control

import (
	"encoding/json"
	"reflect"
	"testing"
)

func protocolRequest(command string, value int) RemoteCommandRequest {
	return RemoteCommandRequest{
		Command: command,
		Value:   value,
		Values:  map[string]int{command: value},
	}
}

func TestIFCC2IIPCommandEncoding(t *testing.T) {
	tests := []struct {
		name     string
		request  RemoteCommandRequest
		expected DeviceCommandPayload
	}{
		{name: "heartbeat", request: RemoteCommandRequest{Command: "HEARTBEAT"}, expected: DeviceCommandPayload{17}},
		{name: "autonomous mode", request: protocolRequest("OPERATING_MODE", 1), expected: DeviceCommandPayload{20, 1}},
		{name: "stop", request: RemoteCommandRequest{Command: "STOP"}, expected: DeviceCommandPayload{23}},
		{name: "tracking", request: protocolRequest("TRACKING", 1), expected: DeviceCommandPayload{24, 1}},
		{name: "left brush", request: protocolRequest("BRUSH_L", 1), expected: DeviceCommandPayload{36, 1, 1}},
		{name: "right brush", request: protocolRequest("BRUSH_R", 1), expected: DeviceCommandPayload{36, 2, 1}},
		{name: "conveyor", request: protocolRequest("CONVEYOR", 1), expected: DeviceCommandPayload{36, 3, 1}},
		{name: "paddle power", request: protocolRequest("PADDLE_POWER", 1), expected: DeviceCommandPayload{36, 4, 1}},
		{name: "disc cylinder", request: protocolRequest("DISC_CYLINDER", 1), expected: DeviceCommandPayload{36, 5, 1}},
		{name: "hatch cylinder", request: protocolRequest("HATCH_CYLINDER", 1), expected: DeviceCommandPayload{36, 6, 1}},
		{name: "cleaning", request: protocolRequest("CLEANING", 1), expected: DeviceCommandPayload{38, 1}},
		{name: "left throttle", request: protocolRequest("THROTTLE_L", 30), expected: DeviceCommandPayload{39, 0, 30}},
		{name: "right throttle", request: protocolRequest("THROTTLE_R", 75), expected: DeviceCommandPayload{39, 1, 75}},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			command, err := BuildRemoteCommand("USV-001", 1, test.request)
			if err != nil {
				t.Fatalf("BuildRemoteCommand() error = %v", err)
			}
			if payload := command.DevicePayload(); !reflect.DeepEqual(payload, test.expected) {
				t.Fatalf("DevicePayload() = %v, want %v", payload, test.expected)
			}
		})
	}
}

func TestHeartbeatSerializesAsProtocolArray(t *testing.T) {
	command, err := BuildRemoteCommand("USV-001", 1, RemoteCommandRequest{Command: "HEARTBEAT"})
	if err != nil {
		t.Fatalf("BuildRemoteCommand() error = %v", err)
	}

	payload, err := json.Marshal(command.DevicePayload())
	if err != nil {
		t.Fatalf("json.Marshal(DevicePayload()) error = %v", err)
	}
	if string(payload) != "[17]" {
		t.Fatalf("heartbeat payload = %s, want [17]", payload)
	}
}

func TestThrottleRejectsNegativeProtocolValue(t *testing.T) {
	_, err := BuildRemoteCommand("USV-001", 1, protocolRequest("THROTTLE_L", -1))
	if !IsValidationError(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
}

func TestParseReceiptAcceptsSystemStatusAndCommandReturnCode(t *testing.T) {
	receipt, ok := parseReceipt("usv/清澜一号/web", []byte(`[17,42,40,120000,1]`))
	if !ok {
		t.Fatal("parseReceipt rejected a valid system status payload")
	}
	if receipt.TopicTarget() != "清澜一号" || receipt.ReturnCode != 40 {
		t.Fatalf("receipt = %+v, want target 清澜一号 and return code 40", receipt)
	}
}

func TestParseReceiptIgnoresCommandPayloadAndWrongTopic(t *testing.T) {
	if _, ok := parseReceipt("usv/清澜一号/web", []byte(`[40,2,121.1,31.2,2]`)); ok {
		t.Fatal("parseReceipt accepted an outbound command payload")
	}
	if _, ok := parseReceipt("usv/清澜一号/telemetry", []byte(`[17,42,40]`)); ok {
		t.Fatal("parseReceipt accepted a non-command topic")
	}
}

func TestRouteCommandCodeAcceptsCoordinateDecimals(t *testing.T) {
	code, err := routeCommandCode(`[40,2,121.12345678,31.12345678,2]`)
	if err != nil || code != 40 {
		t.Fatalf("routeCommandCode() = %d, %v; want 40", code, err)
	}
}
