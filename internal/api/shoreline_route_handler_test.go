package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/shoreline"
)

func publicRouteDataset() *shoreline.Dataset {
	return &shoreline.Dataset{Revision: "revision-1", Files: shoreline.Files{
		Shoreline: json.RawMessage(`{"schema_version":3,"session_id":"a","state":"completed","datum":"WGS84","valid":true,"contour_count":1,"point_count":1,"contours":[{"contour_id":1,"side":1,"sections":[{"line_id":1,"contour_id":1,"section_order":1,"side":1,"kind":1,"points":[{"longitude_deg":121.4,"latitude_deg":31.2}]}]}]}`),
		Center:    json.RawMessage(`{"schema_version":3,"session_id":"a","state":"completed","datum":"WGS84","valid":true,"point_count":2,"route_name":"center","planning_mode":"center_reference","points":[{"point_id":1,"longitude_deg":121.4,"latitude_deg":31.2,"reference_segment_id":1,"reference_can_connect_previous":false},{"point_id":2,"longitude_deg":121.5,"latitude_deg":31.3,"reference_segment_id":1,"reference_can_connect_previous":true}]}`),
	}}
}

func publicRouteRequest(body string, loggedIn bool) *http.Request {
	r := httptest.NewRequest(http.MethodPost, "/api/robots/USV-001/shoreline-routes/center/send", strings.NewReader(body))
	r.SetPathValue("robotName", "USV-001")
	r.SetPathValue("routeKey", "center")
	if loggedIn {
		r.AddCookie(&http.Cookie{Name: sessionCookieName, Value: "session"})
	}
	return r
}

func TestSendShorelineRouteUsesPersistedWGS84AndFixedSpeed(t *testing.T) {
	repository := &fakeShorelineRepository{dataset: publicRouteDataset()}
	publisher := &fakeRoutePublisher{}
	handler := SendShorelineRouteHandler(newPerceptionStore("USV-001"), repository, &fakeShorelineAuth{user: auth.User{ID: "user-1"}}, publisher, shorelineLogger())
	response := httptest.NewRecorder()
	handler(response, publicRouteRequest(`{"expectedRevision":"revision-1"}`, true))
	if response.Code != http.StatusAccepted || publisher.payload != "[40,2,121.40000000,31.20000000,1.944,121.50000000,31.30000000,1.944]" {
		t.Fatalf("status=%d payload=%s body=%s", response.Code, publisher.payload, response.Body)
	}
	var payload struct {
		RouteID              string  `json:"routeId"`
		Revision             string  `json:"revision"`
		CoordinateSystemSent string  `json:"coordinateSystemSent"`
		SpeedMetersPerSecond float64 `json:"speedMetersPerSecond"`
		Reversed             bool    `json:"reversed"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || payload.RouteID != "imported-center" || payload.Revision != "revision-1" || payload.CoordinateSystemSent != "WGS84" || payload.SpeedMetersPerSecond != 1 || payload.Reversed {
		t.Fatalf("response=%s err=%v", response.Body, err)
	}
	if repository.replaceCalls != 0 || repository.deleteCalls != 0 {
		t.Fatal("dispatch changed persisted data")
	}
}

func TestSendShorelineRouteReversesWhenRequestedWithoutSaving(t *testing.T) {
	repository := &fakeShorelineRepository{dataset: publicRouteDataset()}
	publisher := &fakeRoutePublisher{}
	handler := SendShorelineRouteHandler(newPerceptionStore("USV-001"), repository, &fakeShorelineAuth{user: auth.User{ID: "user-1"}}, publisher, shorelineLogger())
	response := httptest.NewRecorder()
	handler(response, publicRouteRequest(`{"expectedRevision":"revision-1","reverse":true}`, true))
	if response.Code != http.StatusAccepted || publisher.payload != "[40,2,121.50000000,31.30000000,1.944,121.40000000,31.20000000,1.944]" {
		t.Fatalf("status=%d payload=%s body=%s", response.Code, publisher.payload, response.Body)
	}
	var payload struct {
		Reversed bool `json:"reversed"`
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil || !payload.Reversed {
		t.Fatalf("response=%s err=%v", response.Body, err)
	}
	if repository.replaceCalls != 0 || repository.deleteCalls != 0 {
		t.Fatal("reversed dispatch changed persisted data")
	}
}

func TestSendShorelineRouteRejectsBeforePublishing(t *testing.T) {
	for _, name := range []string{"no session", "expired session", "stale revision", "deleted dataset", "missing route", "invalid key", "invalid robot", "missing robot", "missing revision", "extra fields", "trailing JSON", "read error", "disconnected route", "invalid coordinate"} {
		t.Run(name, func(t *testing.T) {
			repository := &fakeShorelineRepository{dataset: publicRouteDataset()}
			authenticator := &fakeShorelineAuth{user: auth.User{ID: "user-1"}}
			publisher := &fakeRoutePublisher{}
			request := publicRouteRequest(`{"expectedRevision":"revision-1"}`, name != "no session")
			want := http.StatusBadRequest
			switch name {
			case "no session":
				want = http.StatusUnauthorized
			case "expired session":
				authenticator.err = errors.New("expired")
				want = http.StatusUnauthorized
			case "stale revision":
				repository.dataset.Revision = "revision-2"
				want = http.StatusConflict
			case "deleted dataset":
				repository.dataset = nil
				want = http.StatusConflict
			case "missing route":
				repository.dataset.Files.Center = nil
				want = http.StatusNotFound
			case "invalid key":
				request.SetPathValue("routeKey", "shoreline")
			case "invalid robot":
				request.SetPathValue("robotName", "invalid/robot")
			case "missing robot":
				request.SetPathValue("robotName", "USV-404")
				want = http.StatusNotFound
			case "missing revision":
				request = publicRouteRequest(`{}`, true)
			case "extra fields":
				request = publicRouteRequest(`{"expectedRevision":"revision-1","points":[]}`, true)
			case "trailing JSON":
				request = publicRouteRequest(`{"expectedRevision":"revision-1"}{}`, true)
			case "read error":
				repository.getErr = errors.New("database unavailable")
				want = http.StatusServiceUnavailable
			case "disconnected route":
				repository.dataset.Files.Center = json.RawMessage(strings.Replace(string(repository.dataset.Files.Center), `"reference_can_connect_previous":true`, `"reference_can_connect_previous":false`, 1))
			case "invalid coordinate":
				repository.dataset.Files.Center = json.RawMessage(strings.Replace(string(repository.dataset.Files.Center), "121.4", "181.4", 1))
			}
			response := httptest.NewRecorder()
			SendShorelineRouteHandler(newPerceptionStore("USV-001"), repository, authenticator, publisher, shorelineLogger())(response, request)
			if response.Code != want || publisher.payload != "" {
				t.Fatalf("status=%d want=%d published=%s body=%s", response.Code, want, publisher.payload, response.Body)
			}
			if want == http.StatusUnauthorized && repository.getCalls != 0 {
				t.Fatal("read data before authenticating")
			}
		})
	}
}

func TestSendShorelineRoutePublishFailures(t *testing.T) {
	for _, test := range []struct {
		err    error
		status int
	}{{errors.New("mqtt offline"), 503}, {control.ValidationError{Err: errors.New("invalid payload")}, 400}} {
		response := httptest.NewRecorder()
		SendShorelineRouteHandler(newPerceptionStore("USV-001"), &fakeShorelineRepository{dataset: publicRouteDataset()}, &fakeShorelineAuth{}, &fakeRoutePublisher{pubError: test.err}, shorelineLogger())(response, publicRouteRequest(`{"expectedRevision":"revision-1"}`, true))
		if response.Code != test.status {
			t.Fatalf("status=%d body=%s", response.Code, response.Body)
		}
	}
}

func TestRouterRegistersShorelineRouteWithAuthentication(t *testing.T) {
	router := NewRouter(newPerceptionStore("USV-001"), nil, nil, &fakeRoutePublisher{}, nil, nil, nil, nil, shorelineLogger(), &fakeShorelineRepository{dataset: publicRouteDataset()})
	response := httptest.NewRecorder()
	router.ServeHTTP(response, publicRouteRequest(`{"expectedRevision":"revision-1"}`, false))
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d body=%s", response.Code, response.Body)
	}
}
