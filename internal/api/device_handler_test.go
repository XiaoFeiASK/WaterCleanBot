package api

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

func TestDeviceHandlersValidateCreateAndDelete(t *testing.T) {
	s := location.NewStore()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	create := CreateRobotHandler(s, log)
	for _, test := range []struct {
		body   string
		status int
	}{
		{`{"robotName":""}`, 400},
		{`{"robotName":"usv/002"}`, 400},
		{`{"robotName":"usv+002"}`, 400},
		{`{"robotName":"USV-002","battery":1}`, 400},
		{`{"robotName":"USV-002"} {}`, 400},
		{`{"robotName":" USV-002 "}`, 201},
		{`{"robotName":"USV-002"}`, 409},
	} {
		response := httptest.NewRecorder()
		create(response, httptest.NewRequest(http.MethodPost, "/api/robots", strings.NewReader(test.body)))
		if response.Code != test.status {
			t.Fatalf("%s: status=%d body=%s", test.body, response.Code, response.Body)
		}
	}
	for i := 0; i < 2; i++ {
		r := httptest.NewRequest(http.MethodDelete, "/api/robots/USV-002", nil)
		r.SetPathValue("robotName", "USV-002")
		response := httptest.NewRecorder()
		DeleteRobotHandler(s, log)(response, r)
		if response.Code != http.StatusNoContent {
			t.Fatal(response.Code)
		}
	}
	if len(s.List()) != 0 {
		t.Fatal("device still present")
	}
}

type unavailableDeviceRepository struct{}

func (unavailableDeviceRepository) CreateCurrentPosition(context.Context, string) error {
	return errors.New("offline")
}
func (unavailableDeviceRepository) DeleteCurrentPosition(context.Context, string) error {
	return errors.New("offline")
}
func (unavailableDeviceRepository) UpsertCurrentPosition(context.Context, location.Position, int64) (bool, error) {
	return false, errors.New("offline")
}

func TestDeviceHandlerReportsPersistenceFailureAfterCacheChange(t *testing.T) {
	s := location.NewStore()
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	s.SetWriter(location.NewSnapshotWriter(unavailableDeviceRepository{}, time.Hour, log))
	response := httptest.NewRecorder()
	CreateRobotHandler(s, log)(response, httptest.NewRequest(http.MethodPost, "/api/robots", strings.NewReader(`{"robotName":"USV-002"}`)))
	if response.Code != 503 || !strings.Contains(response.Body.String(), `"cacheChanged":true`) {
		t.Fatalf("response=%d %s", response.Code, response.Body)
	}
	if _, exists := s.Get("USV-002"); !exists {
		t.Fatal("cache not updated before persistence failure")
	}
}
