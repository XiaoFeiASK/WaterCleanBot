package api

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

type protocolCommandPublisher struct{}

func (protocolCommandPublisher) PublishRemoteCommand(_ context.Context, target string, request control.RemoteCommandRequest) (control.RemoteCommandEnvelope, error) {
	return control.BuildRemoteCommand(target, 1, request)
}

func TestCommandResponseSeparatesTrackingAndDockEject(t *testing.T) {
	store := location.NewStore()
	store.LoadInitial([]location.Position{{RobotName: "USV-001"}})
	handler := RobotCommandHandler(store, protocolCommandPublisher{}, slog.New(slog.NewTextHandler(io.Discard, nil)))
	for _, test := range []struct {
		name, body string
		protocol   []int
		hex        string
	}{
		{"dock eject", `{"command":"DOCK_EJECT"}`, []int{234, 1, 235}, "[EA 01 EB]"},
		{"tracking start", `{"command":"TRACKING","value":1,"values":{"TRACKING":1}}`, []int{24, 1}, ""},
		{"tracking stop", `{"command":"TRACKING","value":0,"values":{"TRACKING":0}}`, []int{24, 0}, ""},
	} {
		t.Run(test.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/robots/USV-001/commands", strings.NewReader(test.body))
			request.SetPathValue("robotName", "USV-001")
			response := httptest.NewRecorder()
			handler(response, request)
			if response.Code != http.StatusAccepted {
				t.Fatalf("status = %d, body = %s", response.Code, response.Body)
			}
			var body struct {
				Status   string  `json:"status"`
				Protocol []int   `json:"protocol"`
				Hex      *string `json:"protocolHex"`
			}
			if err := json.Unmarshal(response.Body.Bytes(), &body); err != nil {
				t.Fatal(err)
			}
			if body.Status != "published" || !reflect.DeepEqual(body.Protocol, test.protocol) {
				t.Fatalf("unexpected response: %s", response.Body)
			}
			if test.hex == "" {
				if body.Hex != nil {
					t.Fatalf("tracking must not contain protocolHex: %s", response.Body)
				}
			} else if body.Hex == nil || *body.Hex != test.hex {
				t.Fatalf("incorrect dock frame: %s", response.Body)
			}
		})
	}
}
