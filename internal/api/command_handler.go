// 文件作用：实现机器人遥控指令 HTTP 下发接口。

package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

// RemoteCommandPublisher 是遥控指令发布器需要满足的最小接口。
type RemoteCommandPublisher interface {
	PublishRemoteCommand(context.Context, string, control.RemoteCommandRequest) (control.RemoteCommandEnvelope, error)
}

// RobotCommandHandler 校验前端请求，并把遥控指令交给 MQTT 发布器。
func RobotCommandHandler(store *location.Store, publisher RemoteCommandPublisher, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		if _, ok := store.Get(robotName); !ok {
			log.Debug("robot command target not found", slog.String("robot_name", robotName))
			writeJSON(w, http.StatusNotFound, map[string]string{
				"error": "robot location not found",
			})
			return
		}

		if publisher == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "command publisher is unavailable",
			})
			return
		}

		var request control.RemoteCommandRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{
				"error": "invalid command payload",
			})
			return
		}

		command, err := publisher.PublishRemoteCommand(r.Context(), robotName, request)
		if err != nil {
			log.Warn("publish robot command failed", slog.String("robot_name", robotName), slog.Any("error", err))
			if control.IsValidationError(err) {
				writeJSON(w, http.StatusBadRequest, map[string]string{
					"error": "invalid command payload",
				})
				return
			}
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{
				"error": "publish command failed",
			})
			return
		}

		response := map[string]any{
			"status":    "published",
			"commandId": command.CommandID,
			"seq":       command.Seq,
			"target":    command.Target,
			"topic":     "mqtt",
			"protocol":  command.DevicePayload(),
		}
		if command.Command == "DOCK_EJECT" {
			response["protocolHex"] = "[EA 01 EB]"
		}
		writeJSON(w, http.StatusAccepted, response)
	}
}
