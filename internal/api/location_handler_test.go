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
	store.LoadInitial([]location.Position{{RobotName: "USV-001", Lat: 31, Lng: 120, Battery: 80, Status: 1}})
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
	if err := json.Unmarshal([]byte(data), &snapshot); err != nil || len(snapshot) != 1 || snapshot[0].RobotName != "USV-001" {
		t.Fatalf("snapshot = %s, err = %v", data, err)
	}

	store.Update(location.Position{RobotName: "USV-001", Lat: 32, Lng: 121, Battery: 80, Status: 1, SourceTimestampMS: 2})
	event, data = readSSEEvent(t, reader)
	if event != "position" {
		t.Fatalf("event = %q, want position", event)
	}
	var update location.Position
	if err := json.Unmarshal([]byte(data), &update); err != nil || update.Lat != 32 {
		t.Fatalf("update = %s, err = %v", data, err)
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
