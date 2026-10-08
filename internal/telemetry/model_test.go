// 文件作用：验证 MQTT 遥测报文解析兼容性。

package telemetry

import "testing"

func TestParseNavigationFeedback(t *testing.T) {
	payload := []byte(`[18,106.3975,29.9087,135,1.5,2.5,0.2,-1.5,-0.1,245.6,0.3,4.2,18,4]`)
	position, ok := ParseNavigationFeedback("usv/USV-001/webfeedback", payload)
	if !ok {
		t.Fatal("ParseNavigationFeedback rejected valid payload")
	}
	if position.RobotName != "USV-001" || *position.Lng != 106.3975 || *position.Lat != 29.9087 || *position.Heading != 135 {
		t.Fatalf("unexpected position: %+v", position)
	}
	if *position.Speed != 4.2*knotsToMetersPerSecond || position.SpeedKnots == nil || *position.SpeedKnots != 4.2 {
		t.Fatalf("unexpected speed mapping: %+v", position)
	}
	if position.SatelliteCount == nil || *position.SatelliteCount != 18 || position.GNSSSolutionStatus == nil || *position.GNSSSolutionStatus != 4 {
		t.Fatalf("unexpected GNSS mapping: %+v", position)
	}
}

func TestParseNavigationFeedbackRejectsInvalidPayload(t *testing.T) {
	tests := [][]byte{
		[]byte(`[18,181,29.9087,135,0,0,0,0,0,0,0,4.2,18,4]`),
		[]byte(`[18,106.3975,91,135,0,0,0,0,0,0,0,4.2,18,4]`),
		[]byte(`[18,106.3975,29.9087,135,0,0,0,0,0,0,0,4.2,18,3]`),
	}
	for _, payload := range tests {
		if _, ok := ParseNavigationFeedback("usv/USV-001/webfeedback", payload); ok {
			t.Fatalf("accepted invalid payload: %s", payload)
		}
	}
}

func TestParseUSVDataAcceptsNaNBatteryAndMissingTimestamp(t *testing.T) {
	payload := []byte(`{"lat":29.9087,"lng":106.3975,"heading":135.0,"speed":1.3,"battery":nan,"status":0,"usvId":"USV-001"}`)

	data, err := ParseUSVData("usv/USV-001/telemetry", payload)
	if err != nil {
		t.Fatalf("ParseUSVData returned error: %v", err)
	}

	if data.USVID != "USV-001" {
		t.Fatalf("USVID = %q, want USV-001", data.USVID)
	}
	if data.Battery != 0 {
		t.Fatalf("Battery = %v, want 0 for nan fallback", data.Battery)
	}
	if data.Timestamp <= 0 {
		t.Fatalf("Timestamp = %d, want generated receive timestamp", data.Timestamp)
	}
}

func TestParseUSVDataUsesTopicNameWhenPayloadOmitsUSVID(t *testing.T) {
	payload := []byte(`{"lat":29.9087,"lng":106.3975,"heading":135.0,"speed":1.3,"battery":88,"status":0}`)

	data, err := ParseUSVData("usv/USV-001/telemetry", payload)
	if err != nil {
		t.Fatalf("ParseUSVData rejected payload without usvId: %v", err)
	}
	if data.USVID != "USV-001" {
		t.Fatalf("USVID = %q, want topic name USV-001", data.USVID)
	}
	if position := data.Position(); position.RobotName != "USV-001" {
		t.Fatalf("RobotName = %q, want topic name USV-001", position.RobotName)
	}
}

func TestParseUSVDataPrefersTopicNameOverPayloadUSVID(t *testing.T) {
	payload := []byte(`{"lat":29.9087,"lng":106.3975,"heading":135.0,"speed":1.3,"battery":88,"status":0,"usvId":"USV-002"}`)

	data, err := ParseUSVData("usv/USV-001/telemetry", payload)
	if err != nil {
		t.Fatalf("ParseUSVData rejected topic/payload mismatch: %v", err)
	}
	if data.USVID != "USV-001" {
		t.Fatalf("USVID = %q, want topic name USV-001", data.USVID)
	}
}

func TestParseDistanceFeedbackConvertsP11MetersToKilometers(t *testing.T) {
	payload := []byte(`[19,1,2,3,4,5,6,7,8,9,10,1500]`)
	robotName, distance, ok := ParseDistanceFeedback("usv/USV-001/webfeedback", payload)
	if !ok || robotName != "USV-001" || distance != 1.5 {
		t.Fatalf("feedback = (%q, %v, %v), want USV-001, 1.5, true", robotName, distance, ok)
	}
}

func TestParseDistanceFeedbackRejectsInvalidValues(t *testing.T) {
	for _, payload := range []string{
		`[19,1,2,3,4,5,6,7,8,9,10,-1]`,
		`[19,1,2]`,
		`[18,1,2,3,4,5,6,7,8,9,10,12]`,
		`not-json`,
	} {
		if _, _, ok := ParseDistanceFeedback("usv/USV-001/webfeedback", []byte(payload)); ok {
			t.Fatalf("ParseDistanceFeedback accepted %q", payload)
		}
	}
}

func TestParseStatusFeedbackMappings(t *testing.T) {
	robot, p, ok := ParseStatusFeedback("usv/USV-001/webfeedback", []byte(`[17,2823,0,205755,1]`))
	if !ok || robot != "USV-001" || p.ControlMode == nil || *p.ControlMode != 1 || p.CommandResultCode == nil || *p.CommandResultCode != 0 {
		t.Fatalf("exact 17 feedback mapping = (%q, %+v, %v)", robot, p, ok)
	}
	robot, p, ok = ParseStatusFeedback("usv/USV-001/webfeedback", []byte(`[17,2823,7,205755,2]`))
	if !ok || robot != "USV-001" || p.ControlMode == nil || *p.ControlMode != 2 || p.CommandResultCode == nil || *p.CommandResultCode != 7 {
		t.Fatalf("bad 17 mapping: %+v", p)
	}
	_, p, ok = ParseStatusFeedback("usv/USV-001/webfeedback", []byte(`[21,88,-20,35,0]`))
	if !ok || p.LeftThrottle == nil || *p.LeftThrottle != -20 || p.RightThrottle == nil || *p.RightThrottle != 35 {
		t.Fatalf("bad 21 mapping: %+v", p)
	}
}
