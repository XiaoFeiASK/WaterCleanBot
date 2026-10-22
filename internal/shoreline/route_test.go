package shoreline

import (
	"encoding/json"
	"errors"
	"math"
	"strings"
	"testing"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/routes"
)

func TestNavigationRoutePreservesCoordinatesAndConvertsMetersPerSecondToKnots(t *testing.T) {
	files := fullTestFiles()
	before, _ := json.Marshal(files)
	for _, key := range []string{"left", "center", "right"} {
		route, err := NavigationRoute(files, key)
		if err != nil {
			t.Fatal(err)
		}
		if route.ID != "imported-"+key || route.CoordinateSystem != "WGS84" || len(route.Points) != 2 {
			t.Fatalf("unexpected route: %+v", route)
		}
		for i, point := range route.Points {
			if point.Seq != i+1 || math.Abs(point.SpeedKnots*0.514444-2) > 1e-9 {
				t.Fatalf("unexpected point: %+v", point)
			}
		}
		protocol, err := routes.BuildPathPointProtocol(route, routes.CoordinateSystemWGS84)
		if err != nil || protocol != "[40,2,121.40000000,31.20000000,3.888,121.50000000,31.30000000,3.888]" {
			t.Fatalf("protocol=%s err=%v", protocol, err)
		}
	}
	after, _ := json.Marshal(files)
	if string(before) != string(after) {
		t.Fatal("stored source was modified")
	}
}

func TestNavigationRouteRejectsDisconnectedSegments(t *testing.T) {
	for _, key := range []string{"left", "center", "right"} {
		for _, field := range []string{"reference_segment_id", "reference_can_connect_previous", "map_section"} {
			if key == "center" && field == "map_section" {
				continue
			}
			t.Run(key+"/"+field, func(t *testing.T) {
				files := fullTestFiles()
				var value map[string]any
				_ = json.Unmarshal(files.raw(key), &value)
				last := value["points"].([]any)[1].(map[string]any)
				if field == "reference_can_connect_previous" {
					last[field] = false
				} else {
					last[field] = 2
				}
				encoded, _ := json.Marshal(value)
				switch key {
				case "left":
					files.Left = encoded
				case "center":
					files.Center = encoded
				case "right":
					files.Right = encoded
				}
				if _, err := NavigationRoute(files, key); err == nil || !strings.Contains(err.Error(), "断开") {
					t.Fatalf("expected discontinuity error, got %v", err)
				}
			})
		}
	}
}

func TestNavigationRouteRejectsInvalidInput(t *testing.T) {
	if _, err := NavigationRoute(fullTestFiles(), "shoreline"); err == nil {
		t.Fatal("accepted pure shoreline as an executable route")
	}
	if _, err := NavigationRoute(Files{Shoreline: testShoreline()}, "center"); !errors.Is(err, ErrRouteNotFound) {
		t.Fatalf("missing route: %v", err)
	}
	for _, count := range []int{0, 1, 201} {
		files := fullTestFiles()
		var doc map[string]any
		_ = json.Unmarshal(files.Center, &doc)
		points := make([]map[string]any, count)
		for i := range points {
			points[i] = map[string]any{"point_id": i + 1, "longitude_deg": 121.4, "latitude_deg": 31.2, "reference_segment_id": 1, "reference_can_connect_previous": i > 0}
		}
		doc["points"], doc["point_count"] = points, count
		files.Center, _ = json.Marshal(doc)
		if _, err := NavigationRoute(files, "center"); err == nil {
			t.Fatalf("accepted %d points", count)
		}
	}
	files := fullTestFiles()
	files.Left = raw(strings.Replace(string(files.Left), "121.4", "181.4", 1))
	if _, err := NavigationRoute(files, "left"); err == nil {
		t.Fatal("accepted invalid coordinates")
	}
}
