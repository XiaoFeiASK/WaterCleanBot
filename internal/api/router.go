// 文件作用：注册机器人业务接口与账号认证接口。
package api

import (
	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
	"log/slog"
	"net/http"
)

func NewRouter(store *location.Store, commandPublisher RemoteCommandPublisher, routeRepository RouteRepository, routePublisher RoutePublisher, cameraStreams []CameraStream, authService *auth.Service, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/robots/locations", RobotLocationsHandler(store))
	mux.HandleFunc("GET /api/robots/{robotName}/location", RobotLocationHandler(store, log))
	mux.HandleFunc("POST /api/robots/{robotName}/commands", RobotCommandHandler(store, commandPublisher, log))
	mux.HandleFunc("GET /api/robots/{robotName}/cameras", RobotCamerasHandler(cameraStreams))
	mux.HandleFunc("GET /api/robots/{robotName}/routes", RobotRoutesHandler(routeRepository, log))
	mux.HandleFunc("POST /api/robots/{robotName}/routes", CreateRobotRouteHandler(store, routeRepository, log))
	mux.HandleFunc("DELETE /api/robots/{robotName}/routes/{routeId}", DeleteRobotRouteHandler(routeRepository, log))
	mux.HandleFunc("POST /api/robots/{robotName}/routes/{routeId}/send", SendRobotRouteHandler(store, routeRepository, routePublisher, log))
	if authService != nil {
		h := NewAuthHandler(authService, log)
		mux.HandleFunc("GET /api/auth/config", h.Config)
		mux.HandleFunc("POST /api/auth/register", h.Register)
		mux.HandleFunc("POST /api/auth/login", h.Login)
		mux.HandleFunc("POST /api/auth/logout", h.Logout)
		mux.HandleFunc("GET /api/auth/me", h.Me)
		mux.HandleFunc("POST /api/auth/change-password", h.ChangePassword)
		mux.HandleFunc("PATCH /api/auth/profile", h.UpdateProfile)
	}
	return mux
}
