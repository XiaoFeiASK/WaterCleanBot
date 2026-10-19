package location

import (
	"context"
	"io"
	"log/slog"
	"math"
	"testing"
	"time"
)

func TestUnavailableFixPreservesLastCoordinateAcrossSourcesAndRestart(t *testing.T) {
	noFix := 0
	for _, source := range []string{"telemetry", "navigation"} {
		for _, unavailable := range []struct {
			name     string
			lat, lng *float64
		}{
			{"zero pair", Float(0), Float(0)},
			{"missing pair", nil, nil},
			{"missing longitude", Float(31.4), nil},
			{"out of range", Float(91), Float(121)},
			{"nonfinite", Float(math.NaN()), Float(121)},
		} {
			t.Run(source+"/"+unavailable.name, func(t *testing.T) {
				repository := &fakeSnapshotRepository{}
				writer := NewSnapshotWriter(repository, time.Hour, slog.New(slog.NewTextHandler(io.Discard, nil)))
				store := NewStore()
				store.SetWriter(writer)
				recorder := &recordingTrackRecorder{}
				store.SetTrackRecorder(recorder)
				store.Update(Position{RobotName: "boat", Lat: Float(31.2), Lng: Float(121.4), ReceivedAtMS: 1000})
				invalid := Position{RobotName: "boat", Lat: unavailable.lat, Lng: unavailable.lng, Battery: Float(33), ReceivedAtMS: 2000}
				if source == "navigation" {
					invalid.GNSSSolutionStatus = &noFix
					store.UpdateNavigation(invalid)
				} else {
					store.Update(invalid)
				}
				store.UpdateFeedback("boat", Position{Battery: Float(33)})
				store.UpdateDistance("boat", 0)
				store.UpdateHeartbeat("boat", "offline", 0, 3)
				got, _ := store.Get("boat")
				if got.Lat == nil || got.Lng == nil || *got.Lat != 31.2 || *got.Lng != 121.4 || got.PositionUpdatedAtMS != 1000 {
					t.Fatalf("last fix was overwritten: %+v", got)
				}
				if *got.Battery != 33 || *got.DistanceKm != 0 || got.HeartbeatStatus != "offline" {
					t.Fatalf("non-location feedback was lost: %+v", got)
				}
				if len(recorder.positions) != 1 {
					t.Fatalf("unavailable fix added track samples: %+v", recorder.positions)
				}
				writer.flush(context.Background())
				if len(repository.writes) != 1 {
					t.Fatalf("writes = %d, want one coalesced snapshot", len(repository.writes))
				}
				restored := NewStore()
				restored.LoadInitial([]Position{repository.writes[0].position})
				got, _ = restored.Get("boat")
				if *got.Lat != 31.2 || *got.Lng != 121.4 || got.PositionUpdatedAtMS != 1000 {
					t.Fatalf("restored last fix = %+v", got)
				}
				got, _ = restored.UpdateNavigation(Position{RobotName: "boat", Lat: Float(31.3), Lng: Float(121.5), ReceivedAtMS: 3000})
				if *got.Lat != 31.3 || *got.Lng != 121.5 || got.PositionUpdatedAtMS != 3000 {
					t.Fatalf("valid fix did not resume: %+v", got)
				}
			})
		}
	}
}

func TestNavigationWithoutGNSSSolutionCannotMoveLastFix(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "boat", Lat: Float(31), Lng: Float(121), PositionUpdatedAtMS: 1000}})
	noFix := 0
	got, _ := store.UpdateNavigation(Position{RobotName: "boat", Lat: Float(32), Lng: Float(122), GNSSSolutionStatus: &noFix, ReceivedAtMS: 2000})
	if *got.Lat != 31 || *got.Lng != 121 || got.PositionUpdatedAtMS != 1000 || *got.GNSSSolutionStatus != 0 {
		t.Fatalf("GNSS no-fix replaced usable coordinates or lost GNSS state: %+v", got)
	}
}

func TestUnknownAndLegacyZeroFixesDoNotInventPositions(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "legacy", Lat: Float(0), Lng: Float(0), ReceivedAtMS: 1000}})
	got, _ := store.Get("legacy")
	if got.Lat != nil || got.Lng != nil || got.PositionUpdatedAtMS != 0 {
		t.Fatalf("legacy zero pair was restored as a location: %+v", got)
	}
	got, _ = store.Update(Position{RobotName: "new", Lat: Float(0), Lng: Float(0), Battery: Float(33), ReceivedAtMS: 2000})
	if got.Lat != nil || got.Lng != nil || *got.Battery != 33 || got.PositionUpdatedAtMS != 0 {
		t.Fatalf("first unavailable fix should keep only other telemetry: %+v", got)
	}
	for _, pair := range [][2]float64{{0, 121}, {31, 0}} {
		got, _ = store.Update(Position{RobotName: "new", Lat: Float(pair[0]), Lng: Float(pair[1]), ReceivedAtMS: 3000})
		if *got.Lat != pair[0] || *got.Lng != pair[1] {
			t.Fatalf("valid coordinate on an axis was rejected: %+v", got)
		}
	}
}
