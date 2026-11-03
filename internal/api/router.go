// 文件作用：注册机器人业务接口与账号认证接口。
package api

import (
	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
	"log/slog"
	"net/http"
)

func NewRouter(store *location.Store, commandPublisher RemoteCommandPublisher, routeRepository RouteRepository, routePublisher RoutePublisher, trackRepository TrackRepository, trackService TrackStarter, cameraStreams []CameraStream, authService *auth.Service, log *slog.Logger, shorelineRepositories ...ShorelineRepository) http.Handler {
	mux := http.NewServeMux()
	var shorelineRepository ShorelineRepository
	if len(shorelineRepositories) > 0 {
		shorelineRepository = shorelineRepositories[0]
	}
	var shorelineAuth shorelineAuthenticator
	if authService != nil {
		shorelineAuth = authService
	}
	shorelineHandler := ShorelineHandler(shorelineRepository, shorelineAuth, log)
	for _, method := range []string{"GET", "PUT", "PATCH", "DELETE"} {
		mux.HandleFunc(method+" /api/shoreline", shorelineHandler)
	}
	mux.HandleFunc("POST /api/robots", CreateRobotHandler(store, log))
	mux.HandleFunc("DELETE /api/robots/{robotName}", DeleteRobotHandler(store, log))
	mux.HandleFunc("GET /api/robots/locations", RobotLocationsHandler(store))
	mux.HandleFunc("GET /api/robots/locations/stream", RobotLocationStreamHandler(store, log))
	mux.HandleFunc("GET /api/robots/{robotName}/location", RobotLocationHandler(store, log))
	mux.HandleFunc("POST /api/robots/{robotName}/commands", RobotCommandHandler(store, commandPublisher, log))
	mux.HandleFunc("GET /api/robots/{robotName}/cameras", RobotCamerasHandler(cameraStreams))
	mux.HandleFunc("GET /api/robots/{robotName}/routes", RobotRoutesHandler(routeRepository, log))
	mux.HandleFunc("POST /api/robots/{robotName}/routes", CreateRobotRouteHandler(store, routeRepository, log))
	mux.HandleFunc("PUT /api/robots/{robotName}/routes/{routeId}", UpdateRobotRouteHandler(store, routeRepository, log))
	mux.HandleFunc("DELETE /api/robots/{robotName}/routes/{routeId}", DeleteRobotRouteHandler(routeRepository, log))
	mux.HandleFunc("POST /api/robots/{robotName}/routes/{routeId}/send", SendRobotRouteHandler(store, routeRepository, routePublisher, log))
	mux.HandleFunc("POST /api/robots/{robotName}/perception-route/send", SendPerceptionRouteHandler(store, routePublisher, log))
	mux.HandleFunc("POST /api/robots/{robotName}/shoreline-routes/{routeKey}/send", SendShorelineRouteHandler(store, shorelineRepository, shorelineAuth, routePublisher, log))
	mux.HandleFunc("GET /api/robots/{robotName}/tracks", RobotTracksHandler(trackRepository, log))
	mux.HandleFunc("POST /api/robots/{robotName}/tracks", CreateRobotTrackHandler(store, trackRepository, trackService, log))
	mux.HandleFunc("POST /api/robots/{robotName}/tracks/{trackId}/end", EndRobotTrackHandler(trackRepository, trackService, log))
	mux.HandleFunc("GET /api/robots/{robotName}/tracks/{trackId}/points", RobotTrackPointsHandler(trackRepository, trackService, log))
	mux.HandleFunc("DELETE /api/robots/{robotName}/tracks/{trackId}", DeleteRobotTrackHandler(trackRepository, trackService, log))
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
