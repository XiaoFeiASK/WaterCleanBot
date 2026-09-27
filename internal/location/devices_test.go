package location

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

type deviceRepository struct {
	mu     sync.Mutex
	rows   map[string]Position
	before func(string) error
}

func (r *deviceRepository) apply(kind, name string, position Position) error {
	if r.before != nil {
		if err := r.before(kind); err != nil {
			return err
		}
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	if kind == "delete" {
		delete(r.rows, name)
	} else {
		r.rows[name] = position
	}
	return nil
}
func (r *deviceRepository) UpsertCurrentPosition(_ context.Context, p Position, _ int64) (bool, error) {
	err := r.apply("position", p.RobotName, p)
	return err == nil, err
}
func (r *deviceRepository) CreateCurrentPosition(_ context.Context, name string) error {
	return r.apply("create", name, Position{RobotName: name})
}
func (r *deviceRepository) DeleteCurrentPosition(_ context.Context, name string) error {
	return r.apply("delete", name, Position{})
}
func deviceTestStore() (*Store, *SnapshotWriter, *deviceRepository) {
	r := &deviceRepository{rows: make(map[string]Position)}
	w := NewSnapshotWriter(r, time.Hour, slog.New(slog.NewTextHandler(io.Discard, nil)))
	s := NewStore()
	s.SetWriter(w)
	return s, w, r
}

func TestCreateBroadcastsBeforeDatabaseAndPreservesNullTelemetry(t *testing.T) {
	s, _, r := deviceTestStore()
	_, events, cancel := s.SubscribeWithSnapshot()
	defer cancel()
	r.before = func(kind string) error {
		if _, exists := s.Get("USV-002"); !exists {
			t.Fatal("database called before cache insertion")
		}
		select {
		case event := <-events:
			if kind != "create" || event.Type != "position" || event.Lat != nil || event.Battery != nil {
				t.Fatalf("event=%+v", event)
			}
		default:
			t.Fatal("database called before SSE broadcast")
		}
		return nil
	}
	if err := s.Create(context.Background(), "USV-002"); err != nil {
		t.Fatal(err)
	}
	if err := s.Create(context.Background(), "USV-002"); !errors.Is(err, ErrRobotExists) {
		t.Fatalf("duplicate: %v", err)
	}
	p, _ := s.Get("USV-002")
	b, _ := json.Marshal(p)
	var fields map[string]any
	_ = json.Unmarshal(b, &fields)
	for _, name := range []string{"lat", "lng", "heading", "speed", "battery"} {
		if value, exists := fields[name]; !exists || value != nil {
			t.Fatalf("%s=%v, want explicit null", name, value)
		}
	}
	restarted := NewStore()
	restarted.LoadInitial([]Position{r.rows["USV-002"]})
	if restored, exists := restarted.Get("USV-002"); !exists || restored.Lat != nil {
		t.Fatalf("restore=%+v", restored)
	}
}

func TestDeleteClearsPendingSnapshotAndAllCachesThenMQTTCanReappear(t *testing.T) {
	s, w, r := deviceTestStore()
	s.Update(Position{RobotName: "boat", Lat: Float(31), SourceTimestampMS: 900, ReceivedAtMS: 900})
	s.UpdateDistance("boat", 150)
	_, events, cancel := s.SubscribeWithSnapshot()
	defer cancel()
	r.before = func(kind string) error {
		if kind != "delete" {
			t.Fatalf("old snapshot was written: %s", kind)
		}
		if _, exists := s.Get("boat"); exists {
			t.Fatal("database called before cache deletion")
		}
		if len(s.distances)+len(s.telemetryVersions)+len(s.navigationVersions)+len(s.latestReceivedAtMS) != 0 {
			t.Fatal("stale caches remain")
		}
		if event := <-events; event.Type != "deleted" {
			t.Fatalf("event=%+v", event)
		}
		return nil
	}
	if err := s.Delete(context.Background(), "boat"); err != nil {
		t.Fatal(err)
	}
	r.before = nil
	w.flush(context.Background())
	if len(r.rows) != 0 {
		t.Fatal("old snapshot recreated deleted boat")
	}
	p, accepted := s.Update(Position{RobotName: "boat", Lat: Float(32), SourceTimestampMS: 1, ReceivedAtMS: 1000})
	if !accepted || p.DistanceKm != nil {
		t.Fatalf("new telemetry=%+v accepted=%v", p, accepted)
	}
	w.flush(context.Background())
	if *r.rows["boat"].Lat != 32 {
		t.Fatal("new telemetry was not persisted")
	}
}

func TestInFlightWriteFinishesBeforeDeleteAndNewTelemetrySurvives(t *testing.T) {
	s, w, r := deviceTestStore()
	s.Update(Position{RobotName: "boat", Lat: Float(1), SourceTimestampMS: 1, ReceivedAtMS: 1})
	entered, release, flushed := make(chan struct{}), make(chan struct{}), make(chan struct{})
	var once sync.Once
	r.before = func(kind string) error {
		if kind == "position" {
			once.Do(func() { close(entered); <-release })
		}
		return nil
	}
	go func() { w.flush(context.Background()); close(flushed) }()
	<-entered
	_, events, cancel := s.SubscribeWithSnapshot()
	defer cancel()
	deleted := make(chan error, 1)
	go func() { deleted <- s.Delete(context.Background(), "boat") }()
	select {
	case event := <-events:
		if event.Type != "deleted" {
			t.Fatal(event.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("delete waited for database before updating cache")
	}
	s.Update(Position{RobotName: "boat", Lat: Float(2), SourceTimestampMS: 2, ReceivedAtMS: 2})
	close(release)
	<-flushed
	if err := <-deleted; err != nil {
		t.Fatal(err)
	}
	w.flush(context.Background())
	if *r.rows["boat"].Lat != 2 {
		t.Fatal("new telemetry lost to delayed deletion")
	}
}

func TestFailedDeletionRetriesButDoesNotDeleteNewTelemetry(t *testing.T) {
	s, w, r := deviceTestStore()
	if err := s.Create(context.Background(), "boat"); err != nil {
		t.Fatal(err)
	}
	r.before = func(string) error { return errors.New("database offline") }
	if err := s.Delete(context.Background(), "boat"); err == nil {
		t.Fatal("failure must be reported")
	}
	if _, exists := s.Get("boat"); exists {
		t.Fatal("cache must already be deleted")
	}
	r.before = nil
	s.Update(Position{RobotName: "boat", Lat: Float(3), SourceTimestampMS: 3, ReceivedAtMS: 3})
	w.flush(context.Background())
	w.flush(context.Background())
	if *r.rows["boat"].Lat != 3 {
		t.Fatal("retry deleted new telemetry")
	}
}

func TestFailedCreateAndDeleteAreRetried(t *testing.T) {
	s, w, r := deviceTestStore()
	r.before = func(string) error { return errors.New("database offline") }
	if err := s.Create(context.Background(), "boat"); err == nil {
		t.Fatal("expected create failure")
	}
	r.before = nil
	w.flush(context.Background())
	if _, exists := r.rows["boat"]; !exists {
		t.Fatal("creation not retried")
	}
	r.before = func(string) error { return errors.New("database offline") }
	if err := s.Delete(context.Background(), "boat"); err == nil {
		t.Fatal("expected delete failure")
	}
	r.before = nil
	w.flush(context.Background())
	if _, exists := r.rows["boat"]; exists {
		t.Fatal("deletion not retried")
	}
}

func TestSlowSubscriberReconnectsInsteadOfLosingDeletion(t *testing.T) {
	s := NewStore()
	_, events, cancel := s.SubscribeWithSnapshot()
	defer cancel()
	for i := 0; i < subscriberBufferSize; i++ {
		s.Update(Position{RobotName: "boat"})
	}
	_ = s.Delete(context.Background(), "boat")
	for range events {
	}
	snapshot, _, stop := s.SubscribeWithSnapshot()
	defer stop()
	if len(snapshot) != 0 {
		t.Fatal("reconnect snapshot retained deleted boat")
	}
}
