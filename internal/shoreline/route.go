package shoreline

import (
	"encoding/json"
	"errors"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/routes"
)

const (
	ImportedRouteSpeedMetersPerSecond = 1.0
	ImportedRouteSpeedKnots           = ImportedRouteSpeedMetersPerSecond / 0.514444
)

var ErrRouteNotFound = errors.New("imported route not found")

// NavigationRoute builds an executable route without modifying the stored JSON.
func NavigationRoute(files Files, key string) (routes.Route, error) {
	var source json.RawMessage
	switch key {
	case "left":
		source = files.Left
	case "center":
		source = files.Center
	case "right":
		source = files.Right
	default:
		return routes.Route{}, &ValidationError{Message: "只能下发左岸、中心或右岸航线"}
	}
	if absent(source) {
		return routes.Route{}, ErrRouteNotFound
	}
	if _, err := ValidateFiles(files); err != nil {
		return routes.Route{}, err
	}
	var doc document
	if err := json.Unmarshal(source, &doc); err != nil {
		return routes.Route{}, err
	}
	if len(doc.Points) < routes.MinRoutePoints || len(doc.Points) > routes.MaxRoutePoints {
		return routes.Route{}, &ValidationError{Message: "下发航线需要 2 至 200 个航点，请在外部工具中调整后重新上传"}
	}
	points := make([]routes.RoutePoint, len(doc.Points))
	for index, p := range doc.Points {
		// The boat protocol cannot represent gaps; never join disconnected segments.
		if index > 0 {
			previous := doc.Points[index-1]
			if !*p.ReferenceConnect || *p.ReferenceSegment != *previous.ReferenceSegment ||
				(key != "center" && *p.MapSection != *previous.MapSection) {
				return routes.Route{}, &ValidationError{Message: "航线包含断开的航段，不能整条下发，请在外部工具中调整为连续航线后重新上传"}
			}
		}
		speedKnots := ImportedRouteSpeedKnots
		if p.SpeedKnots != nil {
			speedKnots = *p.SpeedKnots
		}
		points[index] = routes.RoutePoint{
			Seq: index + 1, Lng: *p.Longitude, Lat: *p.Latitude,
			SpeedKnots: speedKnots,
		}
	}
	return routes.Route{ID: "imported-" + key, CoordinateSystem: routes.CoordinateSystemWGS84, Points: points}, nil
}

// ReverseRoute 返回点位顺序相反的副本，原航线数据保持不变。
func ReverseRoute(route routes.Route) routes.Route {
	points := make([]routes.RoutePoint, len(route.Points))
	for index := range route.Points {
		point := route.Points[len(route.Points)-1-index]
		point.Seq = index + 1
		points[index] = point
	}
	route.Points = points
	return route
}
