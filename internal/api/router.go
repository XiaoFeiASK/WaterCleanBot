// 文件作用：注册机器人实时定位查询和遥控指令下发接口。

package api

import (
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

// NewRouter 注册当前后端对外 HTTP 接口。
func NewRouter(store *location.Store, commandPublisher RemoteCommandPublisher, routeRepository RouteRepository, routePublisher RoutePublisher, cameraStreams []CameraStream, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/robots/locations", RobotLocationsHandler(store))
	mux.HandleFunc("GET /api/robots/{robotName}/location", RobotLocationHandler(store, log))
	mux.HandleFunc("POST /api/robots/{robotName}/commands", RobotCommandHandler(store, commandPublisher, log))
	mux.HandleFunc("GET /api/robots/{robotName}/cameras", RobotCamerasHandler(cameraStreams))
	mux.HandleFunc("GET /api/robots/{robotName}/routes", RobotRoutesHandler(routeRepository, log))
	mux.HandleFunc("POST /api/robots/{robotName}/routes", CreateRobotRouteHandler(store, routeRepository, log))
	mux.HandleFunc("DELETE /api/robots/{robotName}/routes/{routeId}", DeleteRobotRouteHandler(routeRepository, log))
	mux.HandleFunc("POST /api/robots/{robotName}/routes/{routeId}/send", SendRobotRouteHandler(store, routeRepository, routePublisher, log))
	return mux
}
