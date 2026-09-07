// 文件作用：验证 MQTT 遥测报文解析兼容性。

package telemetry

import "testing"

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

func TestParseUSVDataRejectsTopicPayloadMismatch(t *testing.T) {
	payload := []byte(`{"lat":29.9087,"lng":106.3975,"heading":135.0,"speed":1.3,"battery":88,"status":0,"usvId":"USV-002"}`)

	if _, err := ParseUSVData("usv/USV-001/telemetry", payload); err == nil {
		t.Fatal("ParseUSVData returned nil error for topic/payload mismatch")
	}
}

func TestParseDistanceFeedbackReadsP11(t *testing.T) {
	payload := []byte(`[19,1,2,3,4,5,6,7,8,9,10,123.45]`)
	robotName, distance, ok := ParseDistanceFeedback("usv/USV-001/webfeedback", payload)
	if !ok || robotName != "USV-001" || distance != 123.45 {
		t.Fatalf("feedback = (%q, %v, %v), want USV-001, 123.45, true", robotName, distance, ok)
	}
}

func TestParseStatusFeedbackMappings(t *testing.T) {
	robot, p, ok := ParseStatusFeedback("usv/USV-001/webfeedback", []byte(`[17,2823,7,2]`))
	if !ok || robot != "USV-001" || p.ControlMode == nil || *p.ControlMode != 2 || p.CommandResultCode == nil || *p.CommandResultCode != 7 { t.Fatalf("bad 17 mapping: %+v", p) }
	_, p, ok = ParseStatusFeedback("usv/USV-001/webfeedback", []byte(`[21,88,-20,35,0]`))
	if !ok || p.LeftThrottle == nil || *p.LeftThrottle != -20 || p.RightThrottle == nil || *p.RightThrottle != 35 { t.Fatalf("bad 21 mapping: %+v", p) }
}
