// 文件作用：验证轨迹采样阈值、异步写入和实时内存行为。

package tracks

import (
	"context"
	"errors"
	"io"
	"log/slog"
	"sync"
	"testing"
	"time"
)

type recordingRepository struct {
	mu            sync.Mutex
	created       []Track
	active        []ActiveTrack
	points        []Point
	pointFailures int
	endErr        error
}

func (r *recordingRepository) ListTracks(context.Context, string) ([]Track, error) { return nil, nil }
func (r *recordingRepository) CreateTrack(_ context.Context, robotName string) (Track, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	track := Track{ID: int64(len(r.created) + 1), RobotName: robotName, TrackNo: int64(len(r.created) + 1), Status: StatusRecording, StartedAt: time.Now().UTC(), Name: "轨迹 1"}
	r.created = append(r.created, track)
	return track, nil
}
func (r *recordingRepository) EndTrack(_ context.Context, _ string, id int64) (Track, error) {
	if r.endErr != nil {
		return Track{}, r.endErr
	}
	return Track{ID: id, Status: StatusEnded}, nil
}
func (r *recordingRepository) ListPoints(context.Context, string, int64) ([]Point, bool, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]Point(nil), r.points...), true, nil
}
func (r *recordingRepository) DeleteTrack(context.Context, string, int64) (bool, error) {
	return true, nil
}
func (r *recordingRepository) ActiveTracks(context.Context) ([]ActiveTrack, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return append([]ActiveTrack(nil), r.active...), nil
}
func (r *recordingRepository) AddPoint(_ context.Context, _ int64, point Point) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.pointFailures > 0 {
		r.pointFailures--
		return context.DeadlineExceeded
	}
	r.points = append(r.points, point)
	return nil
}

func newTestService(repository *recordingRepository) *Service {
	return NewService(repository, slog.New(slog.NewTextHandler(io.Discard, nil)))
}

func waitForPoints(t *testing.T, repository *recordingRepository, count int) []Point {
	t.Helper()
	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		repository.mu.Lock()
		points := append([]Point(nil), repository.points...)
		repository.mu.Unlock()
		if len(points) >= count {
			return points
		}
		time.Sleep(5 * time.Millisecond)
	}
	repository.mu.Lock()
	defer repository.mu.Unlock()
	t.Fatalf("timed out waiting for %d points, got %d", count, len(repository.points))
	return nil
}

func TestRecordPositionFiltersInvalidDuplicateAndTooCloseSamples(t *testing.T) {
	repository := &recordingRepository{}
	service := newTestService(repository)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create(ctx, "USV-001", nil); err != nil {
		t.Fatal(err)
	}

	base := time.Now().UTC().Truncate(time.Millisecond)
	service.RecordPosition("USV-001", 31.2, 121.4, base.UnixMilli())
	service.RecordPosition("USV-001", 31.2, 121.4, base.Add(time.Second).UnixMilli())
	service.RecordPosition("USV-001", 31.2000001, 121.4, base.Add(time.Second*2).UnixMilli())
	service.RecordPosition("USV-001", 95, 121.4, base.Add(time.Second*3).UnixMilli())
	service.RecordPosition("USV-001", 31.2, 121.4, base.Add(time.Second*4).UnixMilli())

	points := waitForPoints(t, repository, 3)
	if len(points) != 3 {
		t.Fatalf("points = %+v, want first point plus 2-second and 3-second samples", points)
	}
	if points[0].Seq != 1 || points[1].Seq != 2 || points[2].Seq != 3 {
		t.Fatalf("point sequence = %+v", points)
	}
}

func TestRecordPositionRetriesDatabaseFailureWithoutBlockingCaller(t *testing.T) {
	repository := &recordingRepository{pointFailures: 1}
	service := newTestService(repository)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	if _, err := service.Create(ctx, "USV-001", nil); err != nil {
		t.Fatal(err)
	}

	start := time.Now()
	service.RecordPosition("USV-001", 31.2, 121.4, time.Now().UnixMilli())
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("RecordPosition blocked for %v", elapsed)
	}
	waitForPoints(t, repository, 1)
}

func TestCreateRejectsSecondActiveTrack(t *testing.T) {
	repository := &recordingRepository{}
	service := newTestService(repository)
	ctx := context.Background()
	if _, err := service.Create(ctx, "USV-001", nil); err != nil {
		t.Fatal(err)
	}
	service.mu.Lock()
	// 模拟数据库侧的唯一进行中轨迹约束返回冲突。
	service.mu.Unlock()
	repository.created = nil
	// 使用具备冲突能力的 fake，验证 service 原样透传 repository 错误。
	service.repository = &conflictRepository{recordingRepository: repository}
	if _, err := service.Create(ctx, "USV-001", nil); !errorsIsActive(err) {
		t.Fatalf("second create error = %v, want active-track conflict", err)
	}
}

type conflictRepository struct{ *recordingRepository }

func (r *conflictRepository) CreateTrack(context.Context, string) (Track, error) {
	return Track{}, ErrActiveTrack
}

func errorsIsActive(err error) bool {
	return err != nil && IsActiveTrackError(err)
}

func TestEndFlushesQueuedPointsBeforeEndingTrack(t *testing.T) {
	repository := &recordingRepository{}
	service := newTestService(repository)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	track, err := service.Create(ctx, "USV-001", nil)
	if err != nil {
		t.Fatal(err)
	}

	base := time.Now().UTC().Truncate(time.Millisecond)
	service.RecordPosition("USV-001", 31.2, 121.4, base.UnixMilli())
	if _, err := service.End(ctx, "USV-001", track.ID); err != nil {
		t.Fatalf("end track: %v", err)
	}
	// 结束请求后到达的点不能再进入 ended 轨迹。
	service.RecordPosition("USV-001", 31.3, 121.5, base.Add(time.Second).UnixMilli())

	points := waitForPoints(t, repository, 1)
	if len(points) != 1 {
		t.Fatalf("points after end = %+v, want only the pre-end sample", points)
	}
}

type controlledRepository struct {
	*recordingRepository
	endStarted chan struct{}
	endRelease chan struct{}
	endCalls   int
	mu         sync.Mutex
}

func (r *controlledRepository) EndTrack(ctx context.Context, robotName string, id int64) (Track, error) {
	r.mu.Lock()
	r.endCalls++
	call := r.endCalls
	r.mu.Unlock()
	if call == 1 && r.endStarted != nil {
		close(r.endStarted)
		select {
		case <-r.endRelease:
		case <-ctx.Done():
			return Track{}, ctx.Err()
		}
		return Track{ID: id, RobotName: robotName, Status: StatusEnded}, nil
	}
	return r.recordingRepository.EndTrack(ctx, robotName, id)
}

func TestEndFailureKeepsRecordingAndAcceptsLaterSamples(t *testing.T) {
	repository := &recordingRepository{endErr: context.DeadlineExceeded}
	service := newTestService(repository)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	track, err := service.Create(ctx, "USV-001", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.End(ctx, "USV-001", track.ID); err == nil {
		t.Fatal("End succeeded despite repository failure")
	}
	service.RecordPosition("USV-001", 31.2, 121.4, time.Now().UnixMilli())
	waitForPoints(t, repository, 1)
}

func TestEndedTrackRejectsLateQueuedPoint(t *testing.T) {
	repository := &recordingRepository{}
	service := newTestService(repository)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	track, err := service.Create(ctx, "USV-001", nil)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := service.End(ctx, "USV-001", track.ID); err != nil {
		t.Fatal(err)
	}
	service.RecordPosition("USV-001", 31.2, 121.4, time.Now().UnixMilli())
	time.Sleep(50 * time.Millisecond)
	repository.mu.Lock()
	defer repository.mu.Unlock()
	if len(repository.points) != 0 {
		t.Fatalf("late point = %+v, want none", repository.points)
	}
}

type statefulEndRepository struct {
	*recordingRepository
	mu    sync.Mutex
	ended map[int64]bool
}

func (r *statefulEndRepository) EndTrack(ctx context.Context, robotName string, id int64) (Track, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if r.ended[id] {
		return Track{}, ErrTrackNotEnded
	}
	r.ended[id] = true
	return Track{ID: id, RobotName: robotName, Status: StatusEnded}, nil
}

func TestConcurrentEndOnlyOneRequestSucceeds(t *testing.T) {
	repository := &statefulEndRepository{recordingRepository: &recordingRepository{}, ended: make(map[int64]bool)}
	service := NewService(repository, slog.New(slog.NewTextHandler(io.Discard, nil)))
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	track, err := service.Create(ctx, "USV-001", nil)
	if err != nil {
		t.Fatal(err)
	}

	const workers = 8
	errs := make(chan error, workers)
	var start sync.WaitGroup
	start.Add(1)
	var done sync.WaitGroup
	for i := 0; i < workers; i++ {
		done.Add(1)
		go func() {
			defer done.Done()
			start.Wait()
			_, err := service.End(ctx, "USV-001", track.ID)
			errs <- err
		}()
	}
	start.Done()
	done.Wait()
	close(errs)

	successes := 0
	for err := range errs {
		if err == nil {
			successes++
			continue
		}
		if !errorsIsActive(err) && !errors.Is(err, ErrTrackNotEnded) && !errors.Is(err, ErrNotFound) {
			t.Fatalf("unexpected concurrent End error: %v", err)
		}
	}
	if successes != 1 {
		t.Fatalf("successful End calls = %d, want 1", successes)
	}
}

func TestEndWaitsForInFlightPointAndBlocksNewSamples(t *testing.T) {
	repository := &recordingRepository{}
	service := newTestService(repository)
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	if err := service.Start(ctx); err != nil {
		t.Fatal(err)
	}
	track, err := service.Create(ctx, "USV-001", nil)
	if err != nil {
		t.Fatal(err)
	}
	service.RecordPosition("USV-001", 31.2, 121.4, time.Now().UnixMilli())
	if _, err := service.End(ctx, "USV-001", track.ID); err != nil {
		t.Fatal(err)
	}
	service.RecordPosition("USV-001", 31.3, 121.5, time.Now().Add(time.Second).UnixMilli())
	points := waitForPoints(t, repository, 1)
	if len(points) != 1 {
		t.Fatalf("points = %+v, want exactly the in-flight sample", points)
	}
}
