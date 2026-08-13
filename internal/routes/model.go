// 文件作用：定义航线规划数据结构、校验规则、距离耗时计算和艇端路径点协议编码。

package routes

import (
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"
)

const (
	// CommandPathPoints 是艇端“路径点发送”指令，十六进制 0x28。
	CommandPathPoints = 40

	CoordinateSystemGCJ02 = "GCJ02"
	CoordinateSystemWGS84 = "WGS84"

	DefaultRouteType = "折线"
	MinRoutePoints   = 2
	MaxRoutePoints   = 200
	MaxSpeedKnots    = 100

	knotToMetersPerSecond = 0.514444
)

// ValidationError 表示航线请求本身非法，调用方应返回 400。
type ValidationError struct {
	Err error
}

func (e ValidationError) Error() string {
	return e.Err.Error()
}

func (e ValidationError) Unwrap() error {
	return e.Err
}

// IsValidationError 判断错误是否由非法航线请求引起。
func IsValidationError(err error) bool {
	var validationError ValidationError
	return errors.As(err, &validationError)
}

// Route 表示一条已保存的航线。
type Route struct {
	DBID             int64        `json:"-"`
	ID               string       `json:"id"`
	RobotName        string       `json:"robotName,omitempty"`
	Type             string       `json:"type"`
	CoordinateSystem string       `json:"coordinateSystem"`
	LengthMeters     float64      `json:"lengthMeters"`
	DurationSeconds  int          `json:"durationSeconds"`
	Points           []RoutePoint `json:"points"`
	CreatedAt        time.Time    `json:"createdAt,omitempty"`
	UpdatedAt        time.Time    `json:"updatedAt,omitempty"`
}

// RoutePoint 是航线中的一个路径点。协议要求下发顺序为 lng、lat、speedKnots。
type RoutePoint struct {
	Seq        int     `json:"seq"`
	Lng        float64 `json:"lng"`
	Lat        float64 `json:"lat"`
	SpeedKnots float64 `json:"speedKnots"`
}

// CreateRouteRequest 是前端保存航线时提交的请求。
type CreateRouteRequest struct {
	Type             string       `json:"type"`
	CoordinateSystem string       `json:"coordinateSystem"`
	Points           []RoutePoint `json:"points"`
}

// RouteMetrics 是后端根据路径点计算出的展示指标。
type RouteMetrics struct {
	LengthMeters    float64
	DurationSeconds int
}

// NormalizeCreateRouteRequest 校验并标准化前端提交的航线。
func NormalizeCreateRouteRequest(request CreateRouteRequest) (CreateRouteRequest, error) {
	routeType := strings.TrimSpace(request.Type)
	if routeType == "" {
		routeType = DefaultRouteType
	}

	coordinateSystem, err := normalizeCoordinateSystem(request.CoordinateSystem)
	if err != nil {
		return CreateRouteRequest{}, ValidationError{Err: err}
	}

	if len(request.Points) < MinRoutePoints {
		return CreateRouteRequest{}, ValidationError{Err: fmt.Errorf("at least %d route points are required", MinRoutePoints)}
	}
	if len(request.Points) > MaxRoutePoints {
		return CreateRouteRequest{}, ValidationError{Err: fmt.Errorf("route points exceed %d", MaxRoutePoints)}
	}

	points := make([]RoutePoint, len(request.Points))
	for index, point := range request.Points {
		normalizedPoint, err := normalizePoint(index+1, point)
		if err != nil {
			return CreateRouteRequest{}, ValidationError{Err: err}
		}
		points[index] = normalizedPoint
	}

	return CreateRouteRequest{
		Type:             routeType,
		CoordinateSystem: coordinateSystem,
		Points:           points,
	}, nil
}

// CalculateMetrics 计算航线长度和预计耗时。每一段速度使用“到该点速度”。
func CalculateMetrics(start *RoutePoint, points []RoutePoint) RouteMetrics {
	var lengthMeters float64
	var durationSeconds float64
	var previous *RoutePoint
	if start != nil {
		startCopy := *start
		previous = &startCopy
	}

	for index := range points {
		point := points[index]
		if previous != nil {
			segmentMeters := DistanceMeters(*previous, point)
			lengthMeters += segmentMeters
			speedMetersPerSecond := point.SpeedKnots * knotToMetersPerSecond
			if speedMetersPerSecond > 0 {
				durationSeconds += segmentMeters / speedMetersPerSecond
			}
		}
		previous = &point
	}

	return RouteMetrics{
		LengthMeters:    lengthMeters,
		DurationSeconds: int(math.Ceil(durationSeconds)),
	}
}

// DistanceMeters 使用 haversine 计算两个经纬度点之间的近似距离。
func DistanceMeters(startPoint RoutePoint, endPoint RoutePoint) float64 {
	const earthRadiusMeters = 6371000
	toRadians := func(degree float64) float64 { return degree * math.Pi / 180 }
	deltaLat := toRadians(endPoint.Lat - startPoint.Lat)
	deltaLng := toRadians(endPoint.Lng - startPoint.Lng)
	startLat := toRadians(startPoint.Lat)
	endLat := toRadians(endPoint.Lat)
	haversine := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) + math.Cos(startLat)*math.Cos(endLat)*math.Sin(deltaLng/2)*math.Sin(deltaLng/2)
	return 2 * earthRadiusMeters * math.Asin(math.Sqrt(haversine))
}

// BuildPathPointProtocol 生成艇端路径点发送协议：[40,点数,lng,lat,speed,...]。
func BuildPathPointProtocol(route Route, outputCoordinateSystem string) (string, error) {
	outputCoordinateSystem, err := normalizeCoordinateSystem(outputCoordinateSystem)
	if err != nil {
		return "", ValidationError{Err: err}
	}
	if len(route.Points) < MinRoutePoints {
		return "", ValidationError{Err: fmt.Errorf("at least %d route points are required", MinRoutePoints)}
	}

	values := make([]string, 0, 2+len(route.Points)*3)
	values = append(values, strconv.Itoa(CommandPathPoints), strconv.Itoa(len(route.Points)))
	for _, point := range route.Points {
		lat, lng := point.Lat, point.Lng
		switch {
		case route.CoordinateSystem == CoordinateSystemGCJ02 && outputCoordinateSystem == CoordinateSystemWGS84:
			lat, lng = GCJ02ToWGS84(lat, lng)
		case route.CoordinateSystem == CoordinateSystemWGS84 && outputCoordinateSystem == CoordinateSystemGCJ02:
			lat, lng = WGS84ToGCJ02(lat, lng)
		}

		values = append(values, formatCoordinate(lng), formatCoordinate(lat), formatSpeedKnots(point.SpeedKnots))
	}

	return "[" + strings.Join(values, ",") + "]", nil
}

func normalizeCoordinateSystem(value string) (string, error) {
	switch strings.ToUpper(strings.TrimSpace(value)) {
	case "", CoordinateSystemGCJ02:
		return CoordinateSystemGCJ02, nil
	case CoordinateSystemWGS84:
		return CoordinateSystemWGS84, nil
	default:
		return "", fmt.Errorf("unsupported coordinate system: %s", value)
	}
}

func normalizePoint(seq int, point RoutePoint) (RoutePoint, error) {
	if !isFinite(point.Lng) || point.Lng < -180 || point.Lng > 180 {
		return RoutePoint{}, fmt.Errorf("points[%d].lng out of range", seq-1)
	}
	if !isFinite(point.Lat) || point.Lat < -90 || point.Lat > 90 {
		return RoutePoint{}, fmt.Errorf("points[%d].lat out of range", seq-1)
	}
	if !isFinite(point.SpeedKnots) || point.SpeedKnots <= 0 || point.SpeedKnots > MaxSpeedKnots {
		return RoutePoint{}, fmt.Errorf("points[%d].speedKnots out of range", seq-1)
	}

	return RoutePoint{
		Seq:        seq,
		Lng:        roundCoordinate(point.Lng),
		Lat:        roundCoordinate(point.Lat),
		SpeedKnots: point.SpeedKnots,
	}, nil
}

func isFinite(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}

func roundCoordinate(value float64) float64 {
	return math.Round(value*1e8) / 1e8
}

func formatCoordinate(value float64) string {
	return fmt.Sprintf("%.8f", roundCoordinate(value))
}

func formatSpeedKnots(value float64) string {
	text := strconv.FormatFloat(value, 'f', 3, 64)
	text = strings.TrimRight(text, "0")
	text = strings.TrimRight(text, ".")
	if text == "" || text == "-0" {
		return "0"
	}
	return text
}
