// 文件作用：注册机器人实时定位查询和遥控指令下发接口。

package api

import (
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

// NewRouter 注册当前后端对外 HTTP 接口。
func NewRouter(store *location.Store, commandPublisher RemoteCommandPublisher, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/robots/locations", RobotLocationsHandler(store))
	mux.HandleFunc("GET /api/robots/{robotName}/location", RobotLocationHandler(store, log))
	mux.HandleFunc("POST /api/robots/{robotName}/commands", RobotCommandHandler(store, commandPublisher, log))
	return mux
}
