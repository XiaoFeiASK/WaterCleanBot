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

	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/shoreline"
)

type fakeShorelineAuth struct {
	user  auth.User
	err   error
	calls int
}

func (a *fakeShorelineAuth) Authenticate(context.Context, string) (auth.User, auth.Session, error) {
	a.calls++
	return a.user, auth.Session{}, a.err
}

type fakeShorelineRepository struct {
	dataset      *shoreline.Dataset
	getErr       error
	replaceErr   error
	updateErr    error
	deleteErr    error
	getCalls     int
	replaceCalls int
	updateCalls  int
	deleteCalls  int
	expected     *string
	uploader     shoreline.Uploader
}

func (r *fakeShorelineRepository) Get(context.Context) (*shoreline.Dataset, error) {
	r.getCalls++
	return r.dataset, r.getErr
}
func (r *fakeShorelineRepository) Replace(_ context.Context, expected *string, files shoreline.Files, uploader shoreline.Uploader) (*shoreline.Dataset, error) {
	r.replaceCalls++
	r.expected, r.uploader = expected, uploader
	if r.replaceErr != nil {
		return nil, r.replaceErr
	}
	r.dataset = &shoreline.Dataset{Revision: "new-revision", Files: files, UploadedBy: uploader}
	return r.dataset, nil
}
func (r *fakeShorelineRepository) Update(_ context.Context, expected *string, files shoreline.Files, uploader shoreline.Uploader) (*shoreline.Dataset, error) {
	r.updateCalls++
	r.expected, r.uploader = expected, uploader
	if r.updateErr != nil {
		return nil, r.updateErr
	}
	var current shoreline.Files
	if r.dataset != nil {
		current = r.dataset.Files
	}
	merged, err := shoreline.MergeFiles(current, files)
	if err != nil {
		return nil, err
	}
	r.dataset = &shoreline.Dataset{Revision: "updated-revision", Files: merged, UploadedBy: uploader}
	return r.dataset, nil
}
func (r *fakeShorelineRepository) Delete(_ context.Context, expected *string) error {
	r.deleteCalls++
	r.expected = expected
	if r.deleteErr == nil {
		r.dataset = nil
	}
	return r.deleteErr
}

func shorelineRequest(method, body string, token bool) *http.Request {
	request := httptest.NewRequest(method, "/api/shoreline", strings.NewReader(body))
	if token {
		request.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "valid-session"})
	}
	return request
}

func shorelineLogger() *slog.Logger { return slog.New(slog.NewTextHandler(io.Discard, nil)) }

func TestShorelineHandlerRequiresLoginBeforeReading(t *testing.T) {
	repository := &fakeShorelineRepository{}
	authenticator := &fakeShorelineAuth{user: auth.User{ID: "user-1", DisplayName: "测试用户"}}
	response := httptest.NewRecorder()
	ShorelineHandler(repository, authenticator, shorelineLogger())(response, shorelineRequest(http.MethodGet, "", false))
	if response.Code != http.StatusUnauthorized || repository.getCalls != 0 || authenticator.calls != 0 {
		t.Fatalf("unauthenticated GET: status=%d getCalls=%d authCalls=%d", response.Code, repository.getCalls, authenticator.calls)
	}
	if got := response.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
}

func TestShorelineHandlerReadsAndReplacesForAuthenticatedUser(t *testing.T) {
	repository := &fakeShorelineRepository{}
	authenticator := &fakeShorelineAuth{user: auth.User{ID: "user-7", DisplayName: "河道管理员"}}
	handler := ShorelineHandler(repository, authenticator, shorelineLogger())

	response := httptest.NewRecorder()
	handler(response, shorelineRequest(http.MethodGet, "", true))
	if response.Code != http.StatusOK || !strings.Contains(response.Body.String(), `"dataset":null`) {
		t.Fatalf("empty GET response: status=%d body=%s", response.Code, response.Body.String())
	}

	body := `{"files":{"shoreline":{"schema_version":3,"session_id":"bundle-a","state":"completed","datum":"WGS84","valid":true,"contour_count":1,"point_count":2,"contours":[{"contour_id":1,"side":1,"sections":[{"line_id":1,"contour_id":1,"section_order":1,"side":1,"kind":1,"points":[{"longitude_deg":121.4,"latitude_deg":31.2},{"longitude_deg":121.5,"latitude_deg":31.3}]}]}]}}}`
	response = httptest.NewRecorder()
	handler(response, shorelineRequest(http.MethodPut, body, true))
	if response.Code != http.StatusOK || repository.replaceCalls != 1 {
		t.Fatalf("replace response: status=%d calls=%d body=%s", response.Code, repository.replaceCalls, response.Body.String())
	}
	if repository.expected != nil || repository.uploader.ID != "user-7" || repository.uploader.DisplayName != "河道管理员" {
		t.Fatalf("replace metadata: expected=%v uploader=%+v", repository.expected, repository.uploader)
	}

	request := shorelineRequest(http.MethodPut, body, true)
	response = httptest.NewRecorder()
	handler(response, request)
	if response.Code != http.StatusOK {
		t.Fatalf("second replace: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestShorelineHandlerReturnsConflictAndRejectsOversize(t *testing.T) {
	repository := &fakeShorelineRepository{replaceErr: shoreline.ErrConflict}
	authenticator := &fakeShorelineAuth{user: auth.User{ID: "user-1", DisplayName: "测试用户"}}
	handler := ShorelineHandler(repository, authenticator, shorelineLogger())
	body := `{"expectedRevision":"stale","files":{"shoreline":{"schema_version":3,"session_id":"bundle-a","state":"completed","datum":"WGS84","valid":true,"contour_count":1,"point_count":2,"contours":[{"contour_id":1,"side":1,"sections":[{"line_id":1,"contour_id":1,"section_order":1,"side":1,"kind":1,"points":[{"longitude_deg":121.4,"latitude_deg":31.2},{"longitude_deg":121.5,"latitude_deg":31.3}]}]}]}}}`
	response := httptest.NewRecorder()
	handler(response, shorelineRequest(http.MethodPut, body, true))
	if response.Code != http.StatusConflict || !strings.Contains(response.Body.String(), "revision_conflict") {
		t.Fatalf("conflict response: status=%d body=%s", response.Code, response.Body.String())
	}

	oversized := `{"padding":"` + strings.Repeat("x", shoreline.MaxRequestBytes) + `"}`
	response = httptest.NewRecorder()
	handler(response, shorelineRequest(http.MethodPut, oversized, true))
	if response.Code != http.StatusRequestEntityTooLarge || !strings.Contains(response.Body.String(), "too_large") {
		t.Fatalf("oversize response: status=%d body=%s", response.Code, response.Body.String())
	}
}

func TestShorelineHandlerDeletesWithExpectedRevision(t *testing.T) {
	revision := "revision-1"
	repository := &fakeShorelineRepository{dataset: &shoreline.Dataset{Revision: revision}}
	authenticator := &fakeShorelineAuth{user: auth.User{ID: "user-1"}}
	response := httptest.NewRecorder()
	ShorelineHandler(repository, authenticator, shorelineLogger())(response, shorelineRequest(http.MethodDelete, `{"expectedRevision":"revision-1"}`, true))
	if response.Code != http.StatusOK || repository.deleteCalls != 1 || repository.expected == nil || *repository.expected != revision {
		t.Fatalf("delete response: status=%d calls=%d expected=%v body=%s", response.Code, repository.deleteCalls, repository.expected, response.Body.String())
	}
	var payload struct {
		Dataset *shoreline.Dataset `json:"dataset"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload.Dataset != nil {
		t.Fatalf("delete result should be empty: payload=%+v err=%v", payload, err)
	}
}
