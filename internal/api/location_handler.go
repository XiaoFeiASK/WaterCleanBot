// 文件作用：实现查询单台机器人实时位置的 HTTP Handler。

package api

import (
	"encoding/json"
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

// RobotLocationHandler 返回指定机器人当前最新位置。
func RobotLocationHandler(store *location.Store, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		position, ok := store.Get(robotName)
		if !ok {
			log.Debug("robot location not found", slog.String("robot_name", robotName))
			writeJSON(w, http.StatusNotFound, map[string]string{
				"error": "robot location not found",
			})
			return
		}

		writeJSON(w, http.StatusOK, position)
	}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
