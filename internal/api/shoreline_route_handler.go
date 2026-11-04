package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/routes"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/shoreline"
)

// SendShorelineRouteHandler publishes a selected route from the persisted public dataset.
func SendShorelineRouteHandler(store *location.Store, repository ShorelineRepository, authenticator shorelineAuthenticator, publisher RoutePublisher, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || authenticator == nil {
			authError(w, 401, "unauthenticated", "请先登录", nil)
			return
		}
		if _, _, err = authenticator.Authenticate(r.Context(), cookie.Value); err != nil {
			authError(w, 401, "unauthenticated", "登录状态已失效，请重新登录", nil)
			return
		}
		robotName, key := r.PathValue("robotName"), r.PathValue("routeKey")
		if err := control.ValidateTarget(robotName); err != nil || (key != "left" && key != "center" && key != "right") {
			authError(w, 400, "invalid_request", "设备名称或导入航线类型无效", nil)
			return
		}
		if store == nil {
			authError(w, 404, "not_found", "未找到该机器人位置，暂不能下发", nil)
			return
		}
		if _, ok := store.Get(robotName); !ok {
			authError(w, 404, "not_found", "未找到该机器人位置，暂不能下发", nil)
			return
		}
		if repository == nil || publisher == nil {
			authError(w, 503, "unavailable", "岸线或 MQTT 服务暂不可用", nil)
			return
		}
		var request struct {
			ExpectedRevision string `json:"expectedRevision"`
			Reverse          bool   `json:"reverse"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, routeRequestMaxBytes))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil || request.ExpectedRevision == "" {
			authError(w, 400, "invalid_request", "下发时必须提供当前公共航线版本", nil)
			return
		}
		if err := decoder.Decode(&struct{}{}); err != io.EOF {
			authError(w, 400, "invalid_request", "JSON 请求格式错误", nil)
			return
		}
		dataset, err := repository.Get(r.Context())
		if err != nil {
			log.Warn("read public route failed", slog.Any("error", err))
			authError(w, 503, "unavailable", "无法读取公共航线，请稍后重试", nil)
			return
		}
		if dataset == nil || dataset.Revision != request.ExpectedRevision {
			authError(w, 409, "revision_conflict", "公共航线已被更新或删除，请重新加载后确认下发", nil)
			return
		}
		route, err := shoreline.NavigationRoute(dataset.Files, key)
		if err != nil {
			if errors.Is(err, shoreline.ErrRouteNotFound) {
				authError(w, 404, "not_found", "该公共航线已不存在，请重新加载", nil)
			} else {
				authError(w, 400, "invalid_route", err.Error(), nil)
			}
			return
		}
		if request.Reverse {
			route = shoreline.ReverseRoute(route)
		}
		protocol, err := routes.BuildPathPointProtocol(route, routes.CoordinateSystemWGS84)
		if err != nil {
			authError(w, 400, "invalid_route", "航线数据无效，不能下发", nil)
			return
		}
		var values []json.Number
		if err := json.Unmarshal([]byte(protocol), &values); err != nil {
			authError(w, 400, "invalid_route", "航线协议生成失败", nil)
			return
		}
		if err := publisher.PublishRoute(r.Context(), robotName, protocol); err != nil {
			log.Warn("publish public route failed", slog.String("robot_name", robotName), slog.String("route_key", key), slog.Any("error", err))
			if control.IsValidationError(err) {
				authError(w, 400, "invalid_route", "航线协议无效，不能下发", nil)
			} else {
				authError(w, 503, "publish_failed", "航线下发失败，请检查 MQTT 服务", nil)
			}
			return
		}
		writeJSON(w, http.StatusAccepted, map[string]any{
			"status": "published", "target": robotName, "topic": "mqtt",
			"routeId": route.ID, "revision": dataset.Revision,
			"protocol": values, "pointCount": len(route.Points),
			"coordinateSystemSent": routes.CoordinateSystemWGS84,
			"speedKnots":           route.Points[0].SpeedKnots,
			"reversed":             request.Reverse,
		})
	}
}
