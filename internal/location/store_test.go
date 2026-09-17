package location

import (
	"context"
	"errors"
	"io"
	"log/slog"
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
