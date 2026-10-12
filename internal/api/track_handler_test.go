// 文件作用：验证历史轨迹 HTTP 接口的校验、状态码与设备归属语义。

package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/tracks"
)

type fakeTrackRepository struct {
	tracks   []tracks.Track
	points   []tracks.Point
	created  tracks.Track
	notFound bool
	err      error
}

func (r *fakeTrackRepository) ListTracks(context.Context, string) ([]tracks.Track, error) {
	return r.tracks, r.err
}
func (r *fakeTrackRepository) CreateTrack(context.Context, string) (tracks.Track, error) {
	return r.created, r.err
}
func (r *fakeTrackRepository) EndTrack(context.Context, string, int64) (tracks.Track, error) {
	return tracks.Track{}, r.err
}
func (r *fakeTrackRepository) ListPoints(context.Context, string, int64) ([]tracks.Point, bool, error) {
	// notFound 用于模拟设备归属不存在，真实 repository 以 exists=false 表达 404。
	if r.notFound {
		return nil, false, nil
	}
	return r.points, true, r.err
}
func (r *fakeTrackRepository) DeleteTrack(context.Context, string, int64) (bool, error) {
	return true, r.err
}

func trackRequest(method, target string, body io.Reader, robotName, trackID string) *http.Request {
	request := httptest.NewRequest(method, target, body)
	request.SetPathValue("robotName", robotName)
	if trackID != "" {
		request.SetPathValue("trackId", trackID)
	}
	return request
}

func TestRobotTracksHandlersValidateNamesAndPayloads(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repository := &fakeTrackRepository{tracks: []tracks.Track{{ID: 1, TrackNo: 1, Name: "轨迹 1", Status: tracks.StatusRecording, StartedAt: time.Now()}}, points: []tracks.Point{}}
	list := RobotTracksHandler(repository, log)
	for _, robotName := range []string{"", "usv/002"} {
		response := httptest.NewRecorder()
		list(response, trackRequest(http.MethodGet, "/", nil, robotName, ""))
		if response.Code != http.StatusBadRequest {
			t.Fatalf("invalid robot %q status = %d", robotName, response.Code)
		}
	}

	response := httptest.NewRecorder()
	list(response, trackRequest(http.MethodGet, "/", nil, "USV-001", ""))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"name":"轨迹 1"`) {
		t.Fatalf("list response = %d %s", response.Code, response.Body.String())
	}

	points := RobotTrackPointsHandler(repository, nil, log)
	response = httptest.NewRecorder()
	points(response, trackRequest(http.MethodGet, "/", nil, "USV-001", "not-a-number"))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("invalid track id status = %d", response.Code)
	}
	response = httptest.NewRecorder()
	points(response, trackRequest(http.MethodGet, "/", nil, "USV-001", "1"))
	var payload []tracks.Point
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload == nil {
		t.Fatalf("empty points payload = %s, err = %v", response.Body, err)
	}
}

func TestCreateAndEndRobotTracksUseConflictResponses(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repository := &fakeTrackRepository{err: tracks.ErrActiveTrack}
	create := CreateRobotTrackHandler(nil, repository, nil, log)
	response := httptest.NewRecorder()
	create(response, trackRequest(http.MethodPost, "/", nil, "USV-001", ""))
	if response.Code != http.StatusConflict {
		t.Fatalf("create conflict status = %d body=%s", response.Code, response.Body)
	}

	repository.err = tracks.ErrTrackNotEnded
	end := EndRobotTrackHandler(repository, nil, log)
	response = httptest.NewRecorder()
	end(response, trackRequest(http.MethodPost, "/", nil, "USV-001", "7"))
	if response.Code != http.StatusConflict {
		t.Fatalf("end ended track status = %d body=%s", response.Code, response.Body)
	}
}

func TestDeleteRecordingTrackIsRejected(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repository := &fakeTrackRepository{err: tracks.ErrTrackNotEnded}
	handler := DeleteRobotTrackHandler(repository, nil, log)
	response := httptest.NewRecorder()
	handler(response, trackRequest(http.MethodDelete, "/", nil, "USV-001", "7"))
	if response.Code != http.StatusConflict {
		t.Fatalf("delete recording status = %d body=%s", response.Code, response.Body)
	}
}

func TestTrackHandlersReturnNotFoundForMissingTracks(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repository := &fakeTrackRepository{err: tracks.ErrNotFound}

	end := EndRobotTrackHandler(repository, nil, log)
	response := httptest.NewRecorder()
	end(response, trackRequest(http.MethodPost, "/", nil, "USV-001", "7"))
	if response.Code != http.StatusNotFound {
		t.Fatalf("end missing track status = %d body=%s", response.Code, response.Body)
	}

	del := DeleteRobotTrackHandler(repository, nil, log)
	response = httptest.NewRecorder()
	del(response, trackRequest(http.MethodDelete, "/", nil, "USV-001", "7"))
	if response.Code != http.StatusNotFound {
		t.Fatalf("delete missing track status = %d body=%s", response.Code, response.Body)
	}
}

func TestDeleteEndedTrackReturnsNoContent(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repository := &fakeTrackRepository{}
	handler := DeleteRobotTrackHandler(repository, nil, log)
	response := httptest.NewRecorder()
	handler(response, trackRequest(http.MethodDelete, "/", nil, "USV-001", "7"))
	if response.Code != http.StatusNoContent {
		t.Fatalf("delete ended status = %d body=%s", response.Code, response.Body)
	}
	if response.Body.Len() != 0 {
		t.Fatalf("delete ended body = %q, want empty", response.Body.String())
	}
}

func TestTrackPointsHandlerReturnsNotFoundWhenTrackNotOwned(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repository := &fakeTrackRepository{notFound: true}
	points := RobotTrackPointsHandler(repository, nil, log)
	response := httptest.NewRecorder()
	points(response, trackRequest(http.MethodGet, "/", nil, "USV-001", "7"))
	if response.Code != http.StatusNotFound {
		t.Fatalf("points missing track status = %d body=%s", response.Code, response.Body)
	}
}

func TestCreateRobotTrackReturnsCreatedSummary(t *testing.T) {
	log := slog.New(slog.NewTextHandler(io.Discard, nil))
	repository := &fakeTrackRepository{
		created: tracks.Track{ID: 5, TrackNo: 5, Name: "轨迹 5", Status: tracks.StatusRecording, StartedAt: time.Now()},
	}
	handler := CreateRobotTrackHandler(nil, repository, nil, log)
	response := httptest.NewRecorder()
	handler(response, trackRequest(http.MethodPost, "/", nil, "USV-001", ""))
	if response.Code != http.StatusCreated {
		t.Fatalf("create status = %d body=%s", response.Code, response.Body)
	}
	if !strings.Contains(response.Body.String(), `"trackNo":5`) {
		t.Fatalf("create body = %s", response.Body.String())
	}
}
