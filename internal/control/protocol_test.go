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
		{name: "tracking start", request: protocolRequest("TRACKING", 1), expected: DeviceCommandPayload{24, 1}},
		{name: "tracking stop", request: protocolRequest("TRACKING", 0), expected: DeviceCommandPayload{24, 0}},
		{name: "dock eject", request: RemoteCommandRequest{Command: "DOCK_EJECT"}, expected: DeviceCommandPayload{0xEA, 0x01, 0xEB}},
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
	if _, err := BuildRemoteCommand("USV-001", 1, protocolRequest("THROTTLE_L", -1)); err != nil {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestRouteCommandCodeAcceptsCoordinateDecimals(t *testing.T) {
	code, err := routeCommandCode(`[40,2,121.12345678,31.12345678,2]`)
	if err != nil || code != 40 {
		t.Fatalf("routeCommandCode() = %d, %v; want 40", code, err)
	}
}

func TestDockEjectSerializesAsRawHexFrame(t *testing.T) {
	command, err := BuildRemoteCommand("USV-001", 1, RemoteCommandRequest{Command: "DOCK_EJECT"})
	if err != nil {
		t.Fatalf("BuildRemoteCommand() error = %v", err)
	}

	payload, err := encodeCommandPayload(command)
	if err != nil {
		t.Fatalf("encodeCommandPayload() error = %v", err)
	}
	want := []byte{0xEA, 0x01, 0xEB}
	if !reflect.DeepEqual(payload, want) {
		t.Fatalf("dock eject payload = % X, want % X", payload, want)
	}
}

func TestDockEjectUsesDedicatedTopicWithQoSZero(t *testing.T) {
	publisher := NewPublisher(PublisherConfig{
		TopicTemplate:  "usv/%s/websend",
		DockEjectTopic: "a40i/sub",
	}, nil)
	command, err := BuildRemoteCommand("USV-001", 1, RemoteCommandRequest{Command: "DOCK_EJECT"})
	if err != nil {
		t.Fatal(err)
	}

	topic, qos := publisher.commandPublishTarget(command)
	if topic != "a40i/sub" || qos != 0 {
		t.Fatalf("dock eject destination = %q (QoS %d), want a40i/sub (QoS 0)", topic, qos)
	}
}

func TestRegularCommandKeepsDeviceTopicAndQoSOne(t *testing.T) {
	publisher := NewPublisher(PublisherConfig{
		TopicTemplate:  "usv/%s/websend",
		DockEjectTopic: "a40i/sub",
	}, nil)
	command, err := BuildRemoteCommand("USV-001", 1, RemoteCommandRequest{Command: "HEARTBEAT"})
	if err != nil {
		t.Fatal(err)
	}

	topic, qos := publisher.commandPublishTarget(command)
	if topic != "usv/USV-001/websend" || qos != 1 {
		t.Fatalf("regular command destination = %q (QoS %d), want usv/USV-001/websend (QoS 1)", topic, qos)
	}
}

func TestTrackingSerializesAsProtocolArray(t *testing.T) {
	for _, test := range []struct {
		value int
		want  string
	}{{0, "[24,0]"}, {1, "[24,1]"}} {
		command, err := BuildRemoteCommand("USV-001", 1, protocolRequest("TRACKING", test.value))
		if err != nil {
			t.Fatal(err)
		}
		payload, err := encodeCommandPayload(command)
		if err != nil {
			t.Fatal(err)
		}
		if string(payload) != test.want {
			t.Fatalf("tracking payload = %s, want %s", payload, test.want)
		}
	}
}
