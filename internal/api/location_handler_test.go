package api

import (
	"bufio"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

func TestRobotLocationStreamSendsSnapshotAndUpdates(t *testing.T) {
	store := location.NewStore()
	store.LoadInitial([]location.Position{{
		RobotName: "USV-001", Lat: location.Float(31), Lng: location.Float(120), Battery: location.Float(80), Status: 1,
		LastDistanceKm: location.Float(10), TotalDistanceKm: location.Float(500),
	}})
	server := httptest.NewServer(RobotLocationStreamHandler(store, slog.New(slog.NewTextHandler(io.Discard, nil))))
	defer server.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, server.URL, nil)
	if err != nil {
		t.Fatal(err)
	}
	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatal(err)
	}
	defer response.Body.Close()
	if contentType := response.Header.Get("Content-Type"); !strings.HasPrefix(contentType, "text/event-stream") {
		t.Fatalf("Content-Type = %q", contentType)
	}

	reader := bufio.NewReader(response.Body)
	event, data := readSSEEvent(t, reader)
	if event != "snapshot" {
		t.Fatalf("event = %q, want snapshot", event)
	}
	var snapshot []location.Position
	if err := json.Unmarshal([]byte(data), &snapshot); err != nil || len(snapshot) != 1 || snapshot[0].RobotName != "USV-001" || snapshot[0].TotalDistanceKm == nil || *snapshot[0].TotalDistanceKm != 500 {
		t.Fatalf("snapshot = %s, err = %v", data, err)
	}

	store.Update(location.Position{RobotName: "USV-001", Lat: location.Float(32), Lng: location.Float(121), Battery: location.Float(80), Status: 1, SourceTimestampMS: 2})
	event, data = readSSEEvent(t, reader)
	if event != "position" {
		t.Fatalf("event = %q, want position", event)
	}
	var update location.Position
	if err := json.Unmarshal([]byte(data), &update); err != nil || *update.Lat != 32 {
		t.Fatalf("update = %s, err = %v", data, err)
	}

	store.UpdateDistance("USV-001", 12)
	event, data = readSSEEvent(t, reader)
	if event != "position" {
		t.Fatalf("event = %q, want distance position", event)
	}
	if err := json.Unmarshal([]byte(data), &update); err != nil || update.DistanceKm == nil || *update.DistanceKm != 12 || update.TotalDistanceKm == nil || *update.TotalDistanceKm != 502 {
		t.Fatalf("distance update = %s, err = %v", data, err)
	}
	if err := store.Delete(ctx, "USV-001"); err != nil {
		t.Fatal(err)
	}
	event, data = readSSEEvent(t, reader)
	if event != "deleted" || !strings.Contains(data, `"robotName":"USV-001"`) {
		t.Fatalf("delete event=%s data=%s", event, data)
	}
}

func TestRobotLocationResponseIncludesTotalDistance(t *testing.T) {
	store := location.NewStore()
	store.LoadInitial([]location.Position{{
		RobotName: "USV-001", LastDistanceKm: location.Float(20), TotalDistanceKm: location.Float(1200),
	}})
	request := httptest.NewRequest(http.MethodGet, "/api/robots/USV-001/location", nil)
	request.SetPathValue("robotName", "USV-001")
	response := httptest.NewRecorder()
	RobotLocationHandler(store, slog.New(slog.NewTextHandler(io.Discard, nil)))(response, request)

	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"distanceKm":20`) || !strings.Contains(response.Body.String(), `"totalDistanceKm":1200`) {
		t.Fatalf("response = %d %s", response.Code, response.Body.String())
	}
}

func readSSEEvent(t *testing.T, reader *bufio.Reader) (string, string) {
	t.Helper()
	var event, data string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read SSE event: %v", err)
		}
		line = strings.TrimSpace(line)
		if line == "" {
			return event, data
		}
		if strings.HasPrefix(line, "event: ") {
			event = strings.TrimPrefix(line, "event: ")
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
}
