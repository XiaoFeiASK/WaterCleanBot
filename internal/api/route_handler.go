// 文件作用：实现规划航线查询、保存、删除和路径点下发接口。

package api

import (
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/routes"
)

const routeRequestMaxBytes = 64 * 1024

// RouteRepository 是航线接口需要的最小数据库能力。
type RouteRepository interface {
	ListRoutes(context.Context, string) ([]routes.Route, error)
	CreateRoute(context.Context, string, routes.CreateRouteRequest, routes.RouteMetrics) (routes.Route, error)
	GetRoute(context.Context, string, string) (routes.Route, bool, error)
	DeleteRoute(context.Context, string, string) (bool, error)
}

// RoutePublisher 是航线下发需要的最小 MQTT 发布能力。
type RoutePublisher interface {
	PublishRoute(context.Context, string, string) error
}

// RobotRoutesHandler 查询指定机器人的规划航线列表。
func RobotRoutesHandler(repository RouteRepository, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		if err := control.ValidateTarget(robotName); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid robot name"})
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "route repository is unavailable"})
			return
		}

		routesList, err := repository.ListRoutes(r.Context(), robotName)
		if err != nil {
			log.Warn("list robot routes failed", slog.String("robot_name", robotName), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list routes failed"})
			return
		}
		writeJSON(w, http.StatusOK, routesList)
	}
}

// CreateRobotRouteHandler 保存前端规划好的真实航线点位。
func CreateRobotRouteHandler(store *location.Store, repository RouteRepository, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		if err := control.ValidateTarget(robotName); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid robot name"})
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "route repository is unavailable"})
			return
		}

		var request routes.CreateRouteRequest
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, routeRequestMaxBytes))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route payload"})
			return
		}

		normalizedRequest, err := routes.NormalizeCreateRouteRequest(request)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route payload"})
			return
		}

		metrics := routes.CalculateMetrics(routeStartPoint(store, robotName, normalizedRequest.CoordinateSystem), normalizedRequest.Points)
		route, err := repository.CreateRoute(r.Context(), robotName, normalizedRequest, metrics)
		if err != nil {
			if routes.IsValidationError(err) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route payload"})
				return
			}
			log.Warn("create robot route failed", slog.String("robot_name", robotName), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create route failed"})
			return
		}

		writeJSON(w, http.StatusCreated, route)
	}
}

// DeleteRobotRouteHandler 删除数据库中的规划航线。
func DeleteRobotRouteHandler(repository RouteRepository, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		routeID := r.PathValue("routeId")
		if err := control.ValidateTarget(robotName); err != nil || routeID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route target"})
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "route repository is unavailable"})
			return
		}

		deleted, err := repository.DeleteRoute(r.Context(), robotName, routeID)
		if err != nil {
			log.Warn("delete robot route failed", slog.String("robot_name", robotName), slog.String("route_id", routeID), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete route failed"})
			return
		}
		if !deleted {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "route not found"})
			return
		}

		w.WriteHeader(http.StatusNoContent)
	}
}

// SendRobotRouteHandler 从数据库读取航线并下发艇端路径点协议。
func SendRobotRouteHandler(store *location.Store, repository RouteRepository, publisher RoutePublisher, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		routeID := r.PathValue("routeId")
		if err := control.ValidateTarget(robotName); err != nil || routeID == "" {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route target"})
			return
		}
		if _, ok := store.Get(robotName); !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "robot location not found"})
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "route repository is unavailable"})
			return
		}
		if publisher == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "route publisher is unavailable"})
			return
		}

		route, ok, err := repository.GetRoute(r.Context(), robotName, routeID)
		if err != nil {
			log.Warn("get robot route failed", slog.String("robot_name", robotName), slog.String("route_id", routeID), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "get route failed"})
			return
		}
		if !ok {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "route not found"})
			return
		}

		protocol, err := routes.BuildPathPointProtocol(route, routes.CoordinateSystemWGS84)
		if err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route payload"})
			return
		}
		// MQTT 载荷保留为数组文本；HTTP 响应同时返回数字数组，便于前端按实际协议展示。
		var protocolValues []json.Number
		if err := json.Unmarshal([]byte(protocol), &protocolValues); err != nil || len(protocolValues) == 0 {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route payload"})
			return
		}

		publishCtx, cancel := context.WithTimeout(r.Context(), 4*time.Second)
		defer cancel()
		if err := publisher.PublishRoute(publishCtx, robotName, protocol); err != nil {
			log.Warn("publish robot route failed", slog.String("robot_name", robotName), slog.String("route_id", routeID), slog.Any("error", err))
			if control.IsValidationError(err) {
				writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid route payload"})
				return
			}
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "publish route failed"})
			return
		}

		writeJSON(w, http.StatusAccepted, map[string]any{
			"status":               "published",
			"routeId":              route.ID,
			"target":               robotName,
			"topic":                "mqtt",
			"protocol":             protocolValues,
			"pointCount":           len(route.Points),
			"coordinateSystemSent": routes.CoordinateSystemWGS84,
		})
	}
}

func routeStartPoint(store *location.Store, robotName string, coordinateSystem string) *routes.RoutePoint {
	if store == nil {
		return nil
	}
	position, ok := store.Get(robotName)
	if !ok {
		return nil
	}

	lat, lng := position.Lat, position.Lng
	if coordinateSystem == routes.CoordinateSystemGCJ02 {
		lat, lng = routes.WGS84ToGCJ02(lat, lng)
	}
	return &routes.RoutePoint{Lat: lat, Lng: lng}
}
