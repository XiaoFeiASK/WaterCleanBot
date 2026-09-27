package location

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"math"
	"sync"
	"testing"
	"time"
)

func TestStoreRejectsStaleTelemetry(t *testing.T) {
	store := NewStore()
	newer := Position{RobotName: "USV-001", Lat: Float(31.2), Lng: Float(120.2), Battery: Float(80), Status: 1, SourceTimestampMS: 200}
	if _, updated := store.Update(newer); !updated {
		t.Fatal("newer update was rejected")
	}
	older := newer
	older.Lat = Float(30.1)
	older.SourceTimestampMS = 100
	if _, updated := store.Update(older); updated {
		t.Fatal("stale update was accepted")
	}
	got, _ := store.Get("USV-001")
	if *got.Lat != *newer.Lat || got.SourceTimestampMS != 200 {
		t.Fatalf("store = %+v, want newer position", got)
	}
}

func TestTelemetryAndNavigationUseIndependentOrderingClocks(t *testing.T) {
	store := NewStore()

	if _, updated := store.Update(Position{
		RobotName: "USV-001", Lat: Float(31), SourceTimestampMS: 10, ReceivedAtMS: 1_000,
	}); !updated {
		t.Fatal("initial telemetry was rejected")
	}
	if _, updated := store.UpdateNavigation(Position{
		RobotName: "USV-001", Lat: Float(32), SourceTimestampMS: 2_000, ReceivedAtMS: 2_000,
	}); !updated {
		t.Fatal("navigation update was rejected by telemetry timestamp")
	}
	if _, updated := store.Update(Position{
		RobotName: "USV-001", Lat: Float(33), SourceTimestampMS: 11, ReceivedAtMS: 3_000,
	}); !updated {
		t.Fatal("new telemetry was rejected by navigation receive time")
	}

	if _, updated := store.UpdateNavigation(Position{
		RobotName: "USV-001", Lat: Float(34), SourceTimestampMS: 2_500, ReceivedAtMS: 2_500,
	}); updated {
		t.Fatal("cross-source update with an older receive time was accepted")
	}

	got, _ := store.Get("USV-001")
	if *got.Lat != 33 || got.SourceTimestampMS != 11 {
		t.Fatalf("store = %+v, want latest telemetry", got)
	}
}

func TestLoadInitialDoesNotRejectFirstRealtimeUpdate(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "USV-001", Lat: Float(1), SourceTimestampMS: 9_999}})

	got, updated := store.Update(Position{RobotName: "USV-001", Lat: Float(2), SourceTimestampMS: 1, ReceivedAtMS: 2})
	if !updated || *got.Lat != 2 {
		t.Fatalf("first realtime update = (%+v, %v), want accepted", got, updated)
	}
}

func TestUpdateDistanceAccumulatesAcrossPowerCyclesAndIgnoresDuplicates(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "USV-001"}})

	for _, distance := range []float64{326, 330, 330, 0.2, 0.4} {
		store.UpdateDistance("USV-001", distance)
	}

	got, ok := store.Get("USV-001")
	if !ok || got.DistanceKm == nil || *got.DistanceKm != 0.4 {
		t.Fatalf("current distance = %+v, want 0.4", got.DistanceKm)
	}
	if got.TotalDistanceKm == nil || *got.TotalDistanceKm != 330.4 {
		t.Fatalf("total distance = %+v, want 330.4", got.TotalDistanceKm)
	}
	if got.LastDistanceKm == nil || *got.LastDistanceKm != 0.4 {
		t.Fatalf("last distance = %+v, want 0.4", got.LastDistanceKm)
	}
}

func TestUpdateDistanceContinuesFromPersistedTotalsAfterRestart(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{
		RobotName:       "USV-001",
		LastDistanceKm:  Float(104),
		TotalDistanceKm: Float(504),
	}})

	store.UpdateDistance("USV-001", 106)
	got, _ := store.Get("USV-001")
	if got.DistanceKm == nil || *got.DistanceKm != 106 || got.TotalDistanceKm == nil || *got.TotalDistanceKm != 506 {
		t.Fatalf("restored distance state = %+v, want current 106 and total 506", got)
	}
}

func TestUpdateDistanceCachesUntilPositionExists(t *testing.T) {
	store := NewStore()
	store.UpdateDistance("USV-001", 12)

	if _, exists := store.Get("USV-001"); exists {
		t.Fatal("distance feedback must not create a position")
	}
	if _, exists := store.distances["USV-001"]; !exists {
		t.Fatal("distance feedback was not cached")
	}

	got, updated := store.Update(Position{RobotName: "USV-001", Lat: Float(31), SourceTimestampMS: 1})
	if !updated || got.DistanceKm == nil || *got.DistanceKm != 12 || got.TotalDistanceKm == nil || *got.TotalDistanceKm != 12 {
		t.Fatalf("position after cached distance = %+v, updated=%v", got, updated)
	}
}

func TestUpdateDistanceIgnoresInvalidReadings(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "USV-001"}})
	store.UpdateDistance("USV-001", 10)
	for _, distance := range []float64{-1, math.NaN(), math.Inf(1), math.Inf(-1)} {
		store.UpdateDistance("USV-001", distance)
	}

	got, _ := store.Get("USV-001")
	if got.DistanceKm == nil || *got.DistanceKm != 10 || got.TotalDistanceKm == nil || *got.TotalDistanceKm != 10 {
		t.Fatalf("invalid readings changed distance state = %+v", got)
	}
}

func TestUpdateFeedbackPreservesDistanceState(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "USV-001"}})
	store.UpdateDistance("USV-001", 25)
	ok := true
	store.UpdateFeedback("USV-001", Position{RobotName: "USV-001", DeviceStatusOK: &ok})

	got, _ := store.Get("USV-001")
	if got.DistanceKm == nil || *got.DistanceKm != 25 || got.TotalDistanceKm == nil || *got.TotalDistanceKm != 25 {
		t.Fatalf("feedback cleared distance state = %+v", got)
	}
}

func TestDistanceUpdatesUseSnapshotWriterCoalescing(t *testing.T) {
	repository := &fakeSnapshotRepository{}
	writer := NewSnapshotWriter(repository, time.Hour, slog.New(slog.NewTextHandler(io.Discard, nil)))
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "USV-001"}})
	store.SetWriter(writer)

	store.UpdateDistance("USV-001", 10)
	store.UpdateDistance("USV-001", 11)
	store.UpdateDistance("USV-001", 12)
	writer.flush(context.Background())

	if len(repository.writes) != 1 {
		t.Fatalf("writes = %d, want one coalesced write", len(repository.writes))
	}
	position := repository.writes[0].position
	if position.LastDistanceKm == nil || *position.LastDistanceKm != 12 || position.TotalDistanceKm == nil || *position.TotalDistanceKm != 12 {
		t.Fatalf("persisted distance state = %+v", position)
	}
}

func TestUpdateNavigationPreservesNonNavigationFeedback(t *testing.T) {
	store := NewStore()
	mode, throttle := 2, 35
	store.LoadInitial([]Position{{
		RobotName: "USV-001", Lat: Float(1), Lng: Float(2), Battery: Float(77), Status: 1,
		ControlMode: &mode, LeftThrottle: &throttle,
	}})
	navigation := Position{RobotName: "USV-001", Lat: Float(31.2), Lng: Float(120.2), Heading: Float(90), Speed: Float(2), SourceTimestampMS: 300}
	got, updated := store.UpdateNavigation(navigation)
	if !updated {
		t.Fatal("navigation update was rejected")
	}
	if *got.Lat != 31.2 || *got.Battery != 77 || got.ControlMode == nil || *got.ControlMode != mode || got.LeftThrottle == nil || *got.LeftThrottle != throttle {
		t.Fatalf("navigation merge = %+v", got)
	}
}

func TestSubscribeWithSnapshotDoesNotMissUpdates(t *testing.T) {
	store := NewStore()
	store.LoadInitial([]Position{{RobotName: "USV-001", Lat: Float(1)}})
	snapshot, updates, cancel := store.SubscribeWithSnapshot()
	defer cancel()
	if len(snapshot) != 1 || *snapshot[0].Lat != 1 {
		t.Fatalf("snapshot = %+v", snapshot)
	}
	store.Update(Position{RobotName: "USV-001", Lat: Float(2), SourceTimestampMS: 2})
	select {
	case update := <-updates:
		if *update.Lat != 2 {
			t.Fatalf("update = %+v", update)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for store update")
	}
}

type fakeSnapshotRepository struct {
	mu       sync.Mutex
	writes   []pendingSnapshot
	failOnce bool
}

func (r *fakeSnapshotRepository) CreateCurrentPosition(context.Context, string) error { return nil }
func (r *fakeSnapshotRepository) DeleteCurrentPosition(context.Context, string) error { return nil }

func (r *fakeSnapshotRepository) UpsertCurrentPosition(_ context.Context, position Position, receivedAtMS int64) (bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.failOnce {
		r.failOnce = false
		return false, errors.New("temporary database failure")
	}
	r.writes = append(r.writes, pendingSnapshot{position: position, receivedAtMS: receivedAtMS})
	return true, nil
}

func TestSnapshotWriterCoalescesLatestPosition(t *testing.T) {
	repository := &fakeSnapshotRepository{}
	writer := NewSnapshotWriter(repository, time.Hour, slog.New(slog.NewTextHandler(io.Discard, nil)))
	writer.Submit(Position{RobotName: "USV-001", Lat: Float(1), ReceivedAtMS: 100})
	writer.Submit(Position{RobotName: "USV-001", Lat: Float(2), ReceivedAtMS: 200})
	writer.Submit(Position{RobotName: "USV-001", Lat: Float(1.5), ReceivedAtMS: 150})
	writer.flush(context.Background())

	if len(repository.writes) != 1 || *repository.writes[0].position.Lat != 2 || repository.writes[0].receivedAtMS != 200 {
		t.Fatalf("writes = %+v", repository.writes)
	}
}

func TestSnapshotWriterRequeuesFailedWriteWithoutOverwritingNewerPending(t *testing.T) {
	repository := &fakeSnapshotRepository{failOnce: true}
	writer := NewSnapshotWriter(repository, time.Hour, slog.New(slog.NewTextHandler(io.Discard, nil)))
	writer.Submit(Position{RobotName: "USV-001", Lat: Float(1), ReceivedAtMS: 100})
	writer.flush(context.Background())
	writer.Submit(Position{RobotName: "USV-001", Lat: Float(2), ReceivedAtMS: 200})
	writer.flush(context.Background())

	if len(repository.writes) != 1 || repository.writes[0].receivedAtMS != 200 {
		t.Fatalf("writes = %+v", repository.writes)
	}
}
