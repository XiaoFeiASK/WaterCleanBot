package routes

import "testing"

func TestBuildPathPointProtocolUsesPathCommandAndLngLatSpeedOrder(t *testing.T) {
	route := Route{
		ID:               "R-001",
		CoordinateSystem: CoordinateSystemWGS84,
		Points: []RoutePoint{
			{Seq: 1, Lng: 121.473701, Lat: 31.230416, SpeedKnots: 2.5},
			{Seq: 2, Lng: 121.4741, Lat: 31.2309, SpeedKnots: 2},
		},
	}

	protocol, err := BuildPathPointProtocol(route, CoordinateSystemWGS84)
	if err != nil {
		t.Fatalf("BuildPathPointProtocol() error = %v", err)
	}

	expected := "[40,2,121.47370100,31.23041600,2.5,121.47410000,31.23090000,2]"
	if protocol != expected {
		t.Fatalf("protocol = %s, want %s", protocol, expected)
	}
}

func TestNormalizeCreateRouteRequestRequiresSpeedBeforePointConfirmation(t *testing.T) {
	_, err := NormalizeCreateRouteRequest(CreateRouteRequest{
		Points: []RoutePoint{
			{Lng: 121.473701, Lat: 31.230416, SpeedKnots: 2.5},
			{Lng: 121.4741, Lat: 31.2309},
		},
	})
	if !IsValidationError(err) {
		t.Fatalf("expected validation error, got %v", err)
	}
}

func TestGCJ02ToWGS84ReversesWGS84ToGCJ02(t *testing.T) {
	lat, lng := 39.916527, 116.397128
	gcjLat, gcjLng := WGS84ToGCJ02(lat, lng)
	wgsLat, wgsLng := GCJ02ToWGS84(gcjLat, gcjLng)

	if diff := wgsLat - lat; diff > 1e-8 || diff < -1e-8 {
		t.Fatalf("lat diff = %v", diff)
	}
	if diff := wgsLng - lng; diff > 1e-8 || diff < -1e-8 {
		t.Fatalf("lng diff = %v", diff)
	}
}
