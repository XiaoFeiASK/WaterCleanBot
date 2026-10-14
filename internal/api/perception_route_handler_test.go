// 文件作用：验证感知航线下发接口的校验、速度覆盖与 MQTT 发布语义。

package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

type fakeRoutePublisher struct {
	target   string
	payload  string
	calls    int
	pubError error
}

func (p *fakeRoutePublisher) PublishRoute(_ context.Context, target string, payload string) error {
	p.calls++
	p.target = target
	p.payload = payload
	return p.pubError
}

func perceptionRequest(robotName, body string) *http.Request {
	request := httptest.NewRequest(http.MethodPost, "/api/robots/"+robotName+"/perception-route/send", strings.NewReader(body))
	request.SetPathValue("robotName", robotName)
	return request
}

func newPerceptionStore(robotNames ...string) *location.Store {
	store := location.NewStore()
	positions := make([]location.Position, 0, len(robotNames))
	for _, name := range robotNames {
		positions = append(positions, location.Position{RobotName: name})
	}
	store.LoadInitial(positions)
	return store
}

func perceptionLogger() *slog.Logger {
	return slog.New(slog.NewTextHandler(io.Discard, nil))
}

func TestSendPerceptionRouteForcesSpeedToTwo(t *testing.T) {
	store := newPerceptionStore("USV-001")
	publisher := &fakeRoutePublisher{}
	handler := SendPerceptionRouteHandler(store, publisher, perceptionLogger())

	body := `{"coordinateSystem":"WGS84","points":[{"seq":1,"lng":121.4296045,"lat":31.2889969,"speedKnots":9},{"seq":2,"lng":121.4296029,"lat":31.2892567,"speedKnots":5}]}`
	response := httptest.NewRecorder()
	handler(response, perceptionRequest("USV-001", body))

	if response.Code != http.StatusAccepted {
		t.Fatalf("status = %d body = %s", response.Code, response.Body)
	}
	if publisher.calls != 1 || publisher.target != "USV-001" {
		t.Fatalf("publish target = %q calls = %d", publisher.target, publisher.calls)
	}
	want := "[40,2,121.42960450,31.28899690,2,121.42960290,31.28925670,2]"
	if publisher.payload != want {
		t.Fatalf("payload = %s, want %s", publisher.payload, want)
	}

	var payload struct {
		Status     string `json:"status"`
		Target     string `json:"target"`
		PointCount int    `json:"pointCount"`
		Protocol   []json.Number
	}
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Status != "published" || payload.Target != "USV-001" || payload.PointCount != 2 {
		t.Fatalf("response = %s", response.Body)
	}
	if len(payload.Protocol) != 8 || payload.Protocol[4].String() != "2" || payload.Protocol[7].String() != "2" {
		t.Fatalf("protocol = %v", payload.Protocol)
	}
}

func TestSendPerceptionRouteRejectsInvalidRequests(t *testing.T) {
	log := perceptionLogger()
	validPoints := `{"coordinateSystem":"WGS84","points":[{"seq":1,"lng":121.4,"lat":31.2},{"seq":2,"lng":121.5,"lat":31.3}]}`

	tests := []struct {
		name       string
		store      *location.Store
		publisher  RoutePublisher
		robotName  string
		body       string
		wantStatus int
	}{
		{"invalid robot name", newPerceptionStore("USV-001"), &fakeRoutePublisher{}, "usv/001", validPoints, http.StatusBadRequest},
		{"missing robot", newPerceptionStore(), &fakeRoutePublisher{}, "USV-404", validPoints, http.StatusNotFound},
		{"publisher unavailable", newPerceptionStore("USV-001"), nil, "USV-001", validPoints, http.StatusServiceUnavailable},
		{"too few points", newPerceptionStore("USV-001"), &fakeRoutePublisher{}, "USV-001", `{"coordinateSystem":"WGS84","points":[{"seq":1,"lng":121.4,"lat":31.2}]}`, http.StatusBadRequest},
		{"invalid coordinate", newPerceptionStore("USV-001"), &fakeRoutePublisher{}, "USV-001", `{"coordinateSystem":"WGS84","points":[{"seq":1,"lng":221.4,"lat":31.2},{"seq":2,"lng":121.5,"lat":31.3}]}`, http.StatusBadRequest},
		{"malformed payload", newPerceptionStore("USV-001"), &fakeRoutePublisher{}, "USV-001", `{"coordinateSystem":"WGS84","points":"nope"}`, http.StatusBadRequest},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler := SendPerceptionRouteHandler(test.store, test.publisher, log)
			response := httptest.NewRecorder()
			handler(response, perceptionRequest(test.robotName, test.body))
			if response.Code != test.wantStatus {
				t.Fatalf("status = %d, want %d, body = %s", response.Code, test.wantStatus, response.Body)
			}
		})
	}
}

func TestSendPerceptionRouteRejectsTooManyPoints(t *testing.T) {
	points := make([]string, 0, 201)
	for index := 0; index < 201; index++ {
		points = append(points, `{"seq":1,"lng":121.4,"lat":31.2}`)
	}
	body := `{"coordinateSystem":"WGS84","points":[` + strings.Join(points, ",") + `]}`
	handler := SendPerceptionRouteHandler(newPerceptionStore("USV-001"), &fakeRoutePublisher{}, perceptionLogger())
	response := httptest.NewRecorder()
	handler(response, perceptionRequest("USV-001", body))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", response.Code, response.Body)
	}
}

func TestSendPerceptionRouteReturnsServiceUnavailableOnPublishFailure(t *testing.T) {
	publisher := &fakeRoutePublisher{pubError: errors.New("mqtt offline")}
	handler := SendPerceptionRouteHandler(newPerceptionStore("USV-001"), publisher, perceptionLogger())
	body := `{"coordinateSystem":"WGS84","points":[{"seq":1,"lng":121.4,"lat":31.2},{"seq":2,"lng":121.5,"lat":31.3}]}`
	response := httptest.NewRecorder()
	handler(response, perceptionRequest("USV-001", body))
	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d body = %s", response.Code, response.Body)
	}
}

func TestSendPerceptionRouteReturnsBadRequestOnPublisherValidationError(t *testing.T) {
	publisher := &fakeRoutePublisher{pubError: control.ValidationError{Err: errors.New("bad payload")}}
	handler := SendPerceptionRouteHandler(newPerceptionStore("USV-001"), publisher, perceptionLogger())
	body := `{"coordinateSystem":"WGS84","points":[{"seq":1,"lng":121.4,"lat":31.2},{"seq":2,"lng":121.5,"lat":31.3}]}`
	response := httptest.NewRecorder()
	handler(response, perceptionRequest("USV-001", body))
	if response.Code != http.StatusBadRequest {
		t.Fatalf("status = %d body = %s", response.Code, response.Body)
	}
}

func TestNewRouterRegistersPerceptionRouteSendWithoutConflict(t *testing.T) {
	// Go 1.22 ServeMux 会在注册冲突时 panic；此处确保新增路由与已有通配路由共存。
	defer func() {
		if recovered := recover(); recovered != nil {
			t.Fatalf("NewRouter panicked: %v", recovered)
		}
	}()
	router := NewRouter(newPerceptionStore("USV-001"), nil, nil, &fakeRoutePublisher{}, nil, nil, nil, nil, perceptionLogger())
	request := httptest.NewRequest(http.MethodPost, "/api/robots/USV-001/perception-route/send", strings.NewReader(`{"coordinateSystem":"WGS84","points":[{"seq":1,"lng":121.4,"lat":31.2},{"seq":2,"lng":121.5,"lat":31.3}]}`))
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusAccepted {
		t.Fatalf("router status = %d body = %s", response.Code, response.Body)
	}
}
