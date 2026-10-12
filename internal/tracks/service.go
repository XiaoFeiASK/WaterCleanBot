// 文件作用：实现历史轨迹采样、异步写入和轨迹管理业务逻辑。

package tracks

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"sync"
	"time"
)

const (
	defaultQueueSize   = 4096
	retryDelay         = 500 * time.Millisecond
	minSampleDistanceM = 1.0
	minSampleInterval  = 2 * time.Second
	drainTimeout       = 2 * time.Second
	endFlushTimeout    = 2 * time.Second
)

// PositionSample 是一帧待采样的 WGS-84 定位。
type PositionSample struct {
	Lat        float64
	Lng        float64
	ReceivedAt time.Time
}

// TrackRepository 是轨迹服务依赖的最小数据库能力。
type TrackRepository interface {
	ListTracks(context.Context, string) ([]Track, error)
	CreateTrack(context.Context, string) (Track, error)
	EndTrack(context.Context, string, int64) (Track, error)
	ListPoints(context.Context, string, int64) ([]Point, bool, error)
	DeleteTrack(context.Context, string, int64) (bool, error)
	ActiveTracks(context.Context) ([]ActiveTrack, error)
	AddPoint(context.Context, int64, Point) error
}

type activeTrackState struct {
	id             int64
	trackNo        int64
	generation     uint64
	lastLat        *float64
	lastLng        *float64
	lastReceivedAt time.Time
	nextPointSeq   int64
}

type sampleJob struct {
	robotName  string
	trackID    int64
	generation uint64
	point      Point
}

// Service 负责当前 recording 轨迹的内存状态，并通过有限队列异步写入轨迹点。
type Service struct {
	repository TrackRepository
	log        *slog.Logger
	queue      chan sampleJob

	mu                 sync.Mutex
	active             map[string]*activeTrackState
	ending             map[string]int64
	endingInFlight     map[string]struct{}
	generations        map[string]uint64
	invalidGenerations map[uint64]struct{}
	deletedTracks      map[int64]struct{}
	pendingByTrack     map[int64]int
	nextGeneration     uint64
}

func NewService(repository TrackRepository, log *slog.Logger) *Service {
	return &Service{
		repository:         repository,
		log:                log,
		queue:              make(chan sampleJob, defaultQueueSize),
		active:             make(map[string]*activeTrackState),
		ending:             make(map[string]int64),
		endingInFlight:     make(map[string]struct{}),
		generations:        make(map[string]uint64),
		invalidGenerations: make(map[uint64]struct{}),
		deletedTracks:      make(map[int64]struct{}),
		pendingByTrack:     make(map[int64]int),
	}
}

// Start 恢复进行中的轨迹并启动异步写入 worker。
func (s *Service) Start(ctx context.Context) error {
	activeTracks, err := s.repository.ActiveTracks(ctx)
	if err != nil {
		return err
	}

	s.mu.Lock()
	for _, item := range activeTracks {
		generation := s.allocateGenerationLocked(item.RobotName)
		s.active[item.RobotName] = &activeTrackState{
			id:             item.ID,
			trackNo:        item.TrackNo,
			generation:     generation,
			lastLat:        item.LastLat,
			lastLng:        item.LastLng,
			lastReceivedAt: item.LastReceivedAt,
			nextPointSeq:   item.NextPointSeq + 1,
		}
	}
	s.mu.Unlock()

	go s.run(ctx)
	return nil
}

// RecordPosition 接收一条实时定位。它永不等待数据库，队列满或服务停止时直接丢弃。
func (s *Service) RecordPosition(robotName string, lat, lng float64, receivedAtMS int64) {
	if !validCoordinate(lat, lng) {
		return
	}
	receivedAt := time.UnixMilli(receivedAtMS)
	if receivedAtMS <= 0 {
		receivedAt = time.Now()
	}
	receivedAt = receivedAt.UTC()

	var dropped bool
	s.mu.Lock()
	active := s.active[robotName]
	if active == nil {
		s.mu.Unlock()
		return
	}
	if _, ending := s.ending[robotName]; ending {
		s.mu.Unlock()
		return
	}

	if active.lastLat != nil && active.lastLng != nil {
		if !active.lastReceivedAt.IsZero() && receivedAt.Before(active.lastReceivedAt) {
			s.mu.Unlock()
			return
		}
		distance := distanceMeters(*active.lastLat, *active.lastLng, lat, lng)
		elapsed := receivedAt.Sub(active.lastReceivedAt)
		if distance < minSampleDistanceM && elapsed < minSampleInterval {
			s.mu.Unlock()
			return
		}
	}

	job := sampleJob{
		robotName:  robotName,
		trackID:    active.id,
		generation: active.generation,
		point: Point{
			Seq:        active.nextPointSeq,
			Lng:        lng,
			Lat:        lat,
			ReceivedAt: receivedAt,
		},
	}
	select {
	case s.queue <- job:
		s.pendingByTrack[active.id]++
		nextLat, nextLng := lat, lng
		active.lastLat = &nextLat
		active.lastLng = &nextLng
		active.lastReceivedAt = receivedAt
		active.nextPointSeq++
	default:
		dropped = true
	}
	s.mu.Unlock()

	if dropped {
		s.log.Warn("track point queue full, sample dropped", slog.String("robot_name", robotName), slog.Int64("track_id", job.trackID))
	}
}

// List 返回设备全部轨迹摘要。
func (s *Service) List(ctx context.Context, robotName string) ([]Track, error) {
	return s.repository.ListTracks(ctx, robotName)
}

// Create 创建并开始一条轨迹；当前实时位置可作为首个采样点立即入队。
func (s *Service) Create(ctx context.Context, robotName string, initial *PositionSample) (Track, error) {
	track, err := s.repository.CreateTrack(ctx, robotName)
	if err != nil {
		return Track{}, err
	}

	s.mu.Lock()
	generation := s.allocateGenerationLocked(robotName)
	s.active[robotName] = &activeTrackState{
		id:           track.ID,
		trackNo:      track.TrackNo,
		generation:   generation,
		nextPointSeq: 1,
	}
	delete(s.ending, robotName)
	s.mu.Unlock()

	if initial != nil {
		s.RecordPosition(robotName, initial.Lat, initial.Lng, initial.ReceivedAt.UnixMilli())
	}
	return track, nil
}

// End 结束指定轨迹，并在数据库成功后停止该设备的采样。
func (s *Service) End(ctx context.Context, robotName string, trackID int64) (Track, error) {
	s.mu.Lock()
	var generation uint64
	if active := s.active[robotName]; active != nil && active.id == trackID {
		if _, inFlight := s.endingInFlight[robotName]; inFlight {
			s.mu.Unlock()
			return Track{}, ErrTrackNotEnded
		}
		s.endingInFlight[robotName] = struct{}{}
		s.ending[robotName] = trackID
		// 结束请求后 RecordPosition 会通过 ending 拒绝新点；
		// 结束前已入队的点仍需正常落库。
		generation = active.generation
	}
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		delete(s.endingInFlight, robotName)
		s.mu.Unlock()
	}()

	if generation != 0 {
		if err := s.waitForTrackQueue(ctx, trackID); err != nil {
			s.resumeEndingTrack(robotName, trackID)
			return Track{}, err
		}
	}

	track, err := s.repository.EndTrack(ctx, robotName, trackID)
	if err != nil {
		s.resumeEndingTrack(robotName, trackID)
		return Track{}, err
	}

	s.mu.Lock()
	if active := s.active[robotName]; active != nil && active.id == trackID {
		s.invalidGenerations[active.generation] = struct{}{}
		delete(s.active, robotName)
	}
	delete(s.ending, robotName)
	s.mu.Unlock()
	return track, nil
}

// resumeEndingTrack 在结束未成功时撤销结束中状态，并启用新的采样代次。
// 已入队的旧代次任务仍会尝试落库；若数据库已实际结束轨迹，AddPoint 不会写入非 recording 轨迹。
func (s *Service) resumeEndingTrack(robotName string, trackID int64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if endingID, ok := s.ending[robotName]; !ok || endingID != trackID {
		return
	}
	delete(s.ending, robotName)
	if active := s.active[robotName]; active != nil && active.id == trackID {
		active.generation = s.allocateGenerationLocked(robotName)
	}
}

// Points 返回指定轨迹全部点。
func (s *Service) Points(ctx context.Context, robotName string, trackID int64) ([]Point, bool, error) {
	return s.repository.ListPoints(ctx, robotName, trackID)
}

// Delete 删除已结束轨迹，并标记轨迹 ID 使尚未写入的旧任务失效。
func (s *Service) Delete(ctx context.Context, robotName string, trackID int64) error {
	deleted, err := s.repository.DeleteTrack(ctx, robotName, trackID)
	if err != nil {
		return err
	}
	if !deleted {
		return ErrNotFound
	}
	s.mu.Lock()
	s.deletedTracks[trackID] = struct{}{}
	s.mu.Unlock()
	return nil
}

// RobotDeleted 在设备删除前停止并失效该设备的采样任务。
func (s *Service) RobotDeleted(robotName string) {
	s.mu.Lock()
	if active := s.active[robotName]; active != nil {
		s.invalidGenerations[active.generation] = struct{}{}
	}
	delete(s.active, robotName)
	delete(s.ending, robotName)
	delete(s.generations, robotName)
	s.mu.Unlock()
}

func (s *Service) run(ctx context.Context) {
	for {
		select {
		case job := <-s.queue:
			s.persistWithRetry(ctx, job)
		case <-ctx.Done():
			s.drain()
			return
		}
	}
}

// waitForTrackQueue 等待指定轨迹在结束请求前已经入队的点完成一次成功写入。
// 队列或数据库长时间不可用时返回错误，让用户重试结束操作，避免静默丢失尾点。
func (s *Service) waitForTrackQueue(ctx context.Context, trackID int64) error {
	deadline := time.Now().Add(endFlushTimeout)
	for {
		s.mu.Lock()
		pending := s.pendingByTrack[trackID]
		s.mu.Unlock()
		if pending == 0 {
			return nil
		}
		if time.Now().After(deadline) {
			return errors.New("track points are still being persisted")
		}
		timer := time.NewTimer(10 * time.Millisecond)
		select {
		case <-ctx.Done():
			timer.Stop()
			return ctx.Err()
		case <-timer.C:
		}
	}
}

func (s *Service) finishQueuedJob(trackID int64) {
	s.mu.Lock()
	if s.pendingByTrack[trackID] <= 1 {
		delete(s.pendingByTrack, trackID)
	} else {
		s.pendingByTrack[trackID]--
	}
	s.mu.Unlock()
}

func (s *Service) persistWithRetry(ctx context.Context, job sampleJob) {
	defer s.finishQueuedJob(job.trackID)
	for {
		if s.jobInvalid(job) {
			return
		}
		err := s.repository.AddPoint(ctx, job.trackID, job.point)
		if err == nil {
			return
		}
		s.log.Warn("persist track point failed, retrying", slog.String("robot_name", job.robotName), slog.Int64("track_id", job.trackID), slog.Any("error", err))

		timer := time.NewTimer(retryDelay)
		select {
		case <-ctx.Done():
			timer.Stop()
			return
		case <-timer.C:
		}
	}
}

func (s *Service) drain() {
	ctx, cancel := context.WithTimeout(context.Background(), drainTimeout)
	defer cancel()
	for {
		select {
		case job := <-s.queue:
			if s.jobInvalid(job) {
				continue
			}
			if err := s.repository.AddPoint(ctx, job.trackID, job.point); err != nil {
				s.log.Warn("persist pending track point during shutdown failed", slog.String("robot_name", job.robotName), slog.Int64("track_id", job.trackID), slog.Any("error", err))
			}
		default:
			return
		}
	}
}

func (s *Service) jobInvalid(job sampleJob) bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, deleted := s.deletedTracks[job.trackID]; deleted {
		return true
	}
	if _, invalid := s.invalidGenerations[job.generation]; invalid {
		return true
	}
	return false
}

func (s *Service) allocateGenerationLocked(robotName string) uint64 {
	s.nextGeneration++
	s.generations[robotName] = s.nextGeneration
	return s.nextGeneration
}

func validCoordinate(lat, lng float64) bool {
	return !math.IsNaN(lat) && !math.IsInf(lat, 0) && lat >= -90 && lat <= 90 &&
		!math.IsNaN(lng) && !math.IsInf(lng, 0) && lng >= -180 && lng <= 180
}

func distanceMeters(lat1, lng1, lat2, lng2 float64) float64 {
	const earthRadiusMeters = 6371000
	toRadians := func(degree float64) float64 { return degree * math.Pi / 180 }
	deltaLat := toRadians(lat2 - lat1)
	deltaLng := toRadians(lng2 - lng1)
	startLat := toRadians(lat1)
	endLat := toRadians(lat2)
	haversine := math.Sin(deltaLat/2)*math.Sin(deltaLat/2) + math.Cos(startLat)*math.Cos(endLat)*math.Sin(deltaLng/2)*math.Sin(deltaLng/2)
	return 2 * earthRadiusMeters * math.Asin(math.Sqrt(haversine))
}

// ErrActiveTrack 由 repository 返回，Service 透传时保留 errors.Is 语义。
func IsActiveTrackError(err error) bool { return errors.Is(err, ErrActiveTrack) }
