// 文件作用：提供无人船实时状态内存缓存，并向 SSE 客户端广播变化。

package location

import (
	"context"
	"errors"
	"math"
	"sort"
	"strings"
	"sync"
	"time"
	"unicode"
)

const subscriberBufferSize = 64

var ErrRobotExists = errors.New("robot already exists")

type Event struct {
	Position
	Type string
}

type distanceState struct {
	last  float64
	total float64
}

// Store 保存每台无人船的最新位置。它是运行期间实时状态的唯一数据源。
type Store struct {
	mu                 sync.RWMutex
	positions          map[string]Position
	distances          map[string]distanceState
	telemetryVersions  map[string]int64
	navigationVersions map[string]int64
	latestReceivedAtMS map[string]int64
	subscribers        map[uint64]chan Event
	nextSubID          uint64
	writer             *SnapshotWriter
}

// NewStore 创建实时位置存储。
func NewStore() *Store {
	return &Store{
		positions:          make(map[string]Position),
		distances:          make(map[string]distanceState),
		telemetryVersions:  make(map[string]int64),
		navigationVersions: make(map[string]int64),
		latestReceivedAtMS: make(map[string]int64),
		subscribers:        make(map[uint64]chan Event),
	}
}

func ValidRobotName(name string) bool {
	if name == "" || len(name) > 128 || strings.TrimSpace(name) != name {
		return false
	}
	for _, char := range name {
		if unicode.IsControl(char) || strings.ContainsRune("/+#?\\", char) {
			return false
		}
	}
	return true
}

// SetWriter is configured once, before MQTT and HTTP start.
func (s *Store) SetWriter(writer *SnapshotWriter) { s.writer = writer }

func (s *Store) Create(ctx context.Context, robotName string) error {
	if !ValidRobotName(robotName) {
		return errors.New("invalid robot name")
	}
	s.mu.Lock()
	if _, exists := s.positions[robotName]; exists {
		s.mu.Unlock()
		return ErrRobotExists
	}
	position := Position{RobotName: robotName}
	s.positions[robotName] = position
	if s.writer != nil {
		s.writer.QueueChange(robotName, "create")
	}
	s.broadcastLocked(position)
	s.mu.Unlock()
	if s.writer != nil {
		return s.writer.Persist(ctx, robotName)
	}
	return nil
}

func (s *Store) Delete(ctx context.Context, robotName string) error {
	s.mu.Lock()
	delete(s.positions, robotName)
	delete(s.distances, robotName)
	delete(s.telemetryVersions, robotName)
	delete(s.navigationVersions, robotName)
	delete(s.latestReceivedAtMS, robotName)
	if s.writer != nil {
		s.writer.QueueChange(robotName, "delete")
	}
	s.broadcastEventLocked(Event{Type: "deleted", Position: Position{RobotName: robotName}})
	s.mu.Unlock()
	if s.writer != nil {
		return s.writer.Persist(ctx, robotName)
	}
	return nil
}

func (s *Store) queuePositionLocked(position Position) {
	if s.writer != nil {
		s.writer.Submit(position)
	}
}

func mergeFeedback(position *Position, previous Position) {
	position.HeadingRate = previous.HeadingRate
	position.Pitch = previous.Pitch
	position.PitchRate = previous.PitchRate
	position.Roll = previous.Roll
	position.RollRate = previous.RollRate
	position.Altitude = previous.Altitude
	position.Heave = previous.Heave
	position.SpeedKnots = previous.SpeedKnots
	position.SatelliteCount = previous.SatelliteCount
	position.GNSSSolutionStatus = previous.GNSSSolutionStatus
	position.ControlMode = previous.ControlMode
	position.CommandResultCode = previous.CommandResultCode
	position.LeftThrottle = previous.LeftThrottle
	position.RightThrottle = previous.RightThrottle
	position.Actuators = cloneActuators(previous.Actuators)
	position.DeviceStatusOK = previous.DeviceStatusOK
}

func cloneActuators(values map[string]int) map[string]int {
	if values == nil {
		return nil
	}
	cloned := make(map[string]int, len(values))
	for key, value := range values {
		cloned[key] = value
	}
	return cloned
}

func clonePosition(position Position) Position {
	for _, field := range []**float64{
		&position.Lat, &position.Lng, &position.Heading, &position.Speed, &position.Battery,
		&position.DistanceMeters, &position.TotalDistanceMeters, &position.LastDistanceMeters,
	} {
		if *field != nil {
			*field = Float(**field)
		}
	}
	position.Actuators = cloneActuators(position.Actuators)
	return position
}

func (s *Store) prepareRealtimePosition(position Position, previous Position, exists bool) Position {
	if position.ReceivedAtMS <= 0 {
		position.ReceivedAtMS = time.Now().UnixMilli()
	}
	if exists {
		position.HeartbeatStatus = previous.HeartbeatStatus
		position.HeartbeatLastAckAt = previous.HeartbeatLastAckAt
		position.HeartbeatMisses = previous.HeartbeatMisses
		mergeFeedback(&position, previous)
	}
	if distance, ok := s.distances[position.RobotName]; ok {
		position.DistanceMeters = Float(distance.last)
		position.LastDistanceMeters = Float(distance.last)
		position.TotalDistanceMeters = Float(distance.total)
	}
	return position
}

// Update 写入 MQTT telemetry 的最新位置，并立即通知 SSE 客户端。
func (s *Store) Update(position Position) (Position, bool) {
	s.mu.Lock()
	previous, exists := s.positions[position.RobotName]
	position = s.prepareRealtimePosition(position, previous, exists)
	if latestVersion := s.telemetryVersions[position.RobotName]; position.SourceTimestampMS > 0 && latestVersion > 0 && position.SourceTimestampMS < latestVersion {
		s.mu.Unlock()
		return clonePosition(previous), false
	}
	if latestReceivedAt := s.latestReceivedAtMS[position.RobotName]; latestReceivedAt > 0 && position.ReceivedAtMS < latestReceivedAt {
		s.mu.Unlock()
		return clonePosition(previous), false
	}
	if position.SourceTimestampMS > 0 {
		s.telemetryVersions[position.RobotName] = position.SourceTimestampMS
	}
	s.latestReceivedAtMS[position.RobotName] = position.ReceivedAtMS
	s.positions[position.RobotName] = clonePosition(position)
	s.queuePositionLocked(position)
	s.broadcastLocked(position)
	s.mu.Unlock()
	return clonePosition(position), true
}

// LoadInitial 用数据库快照初始化内存。它只能在 MQTT 订阅启动前调用。
func (s *Store) LoadInitial(positions []Position) {
	s.mu.Lock()
	defer s.mu.Unlock()

	next := make(map[string]Position, len(positions))
	distances := make(map[string]distanceState)
	for _, position := range positions {
		if position.LastDistanceMeters != nil && position.TotalDistanceMeters != nil {
			distance := distanceState{last: *position.LastDistanceMeters, total: *position.TotalDistanceMeters}
			distances[position.RobotName] = distance
			position.DistanceMeters = Float(distance.last)
		}
		next[position.RobotName] = clonePosition(position)
	}
	s.positions = next
	s.distances = distances
}

// UpdateNavigation 合并设备通过 [18,...] webfeedback 上报的导航定位信息。
func (s *Store) UpdateNavigation(position Position) (Position, bool) {
	s.mu.Lock()
	previous, exists := s.positions[position.RobotName]
	if position.ReceivedAtMS <= 0 {
		position.ReceivedAtMS = time.Now().UnixMilli()
	}
	if latestVersion := s.navigationVersions[position.RobotName]; latestVersion > 0 && position.ReceivedAtMS < latestVersion {
		s.mu.Unlock()
		return clonePosition(previous), false
	}
	if latestReceivedAt := s.latestReceivedAtMS[position.RobotName]; latestReceivedAt > 0 && position.ReceivedAtMS < latestReceivedAt {
		s.mu.Unlock()
		return clonePosition(previous), false
	}
	s.navigationVersions[position.RobotName] = position.ReceivedAtMS
	s.latestReceivedAtMS[position.RobotName] = position.ReceivedAtMS
	if exists {
		position.Battery = previous.Battery
		position.Status = previous.Status
		position.HeartbeatStatus = previous.HeartbeatStatus
		position.HeartbeatLastAckAt = previous.HeartbeatLastAckAt
		position.HeartbeatMisses = previous.HeartbeatMisses
		position.DistanceMeters = previous.DistanceMeters
		position.ControlMode = previous.ControlMode
		position.CommandResultCode = previous.CommandResultCode
		position.LeftThrottle = previous.LeftThrottle
		position.RightThrottle = previous.RightThrottle
		position.Actuators = cloneActuators(previous.Actuators)
		position.DeviceStatusOK = previous.DeviceStatusOK
	}
	if distance, ok := s.distances[position.RobotName]; ok {
		position.DistanceMeters = Float(distance.last)
		position.LastDistanceMeters = Float(distance.last)
		position.TotalDistanceMeters = Float(distance.total)
	}
	s.positions[position.RobotName] = clonePosition(position)
	s.queuePositionLocked(position)
	s.broadcastLocked(position)
	s.mu.Unlock()
	return clonePosition(position), true
}

// UpdateFeedback 合并设备通过 webfeedback 上报的最新状态。
func (s *Store) UpdateFeedback(robotName string, feedback Position) {
	s.mu.Lock()
	position := s.positions[robotName]
	position.RobotName = robotName
	position.ReceivedAtMS = time.Now().UnixMilli()
	if position.SourceTimestampMS == 0 {
		position.SourceTimestampMS = position.ReceivedAtMS
	}
	if feedback.ControlMode != nil {
		position.ControlMode = feedback.ControlMode
	}
	if feedback.CommandResultCode != nil {
		position.CommandResultCode = feedback.CommandResultCode
	}
	if feedback.LeftThrottle != nil {
		position.LeftThrottle = feedback.LeftThrottle
	}
	if feedback.RightThrottle != nil {
		position.RightThrottle = feedback.RightThrottle
	}
	if feedback.Battery != nil {
		position.Battery = feedback.Battery
	}
	if feedback.Actuators != nil {
		position.Actuators = cloneActuators(feedback.Actuators)
	}
	if feedback.DeviceStatusOK != nil {
		position.DeviceStatusOK = feedback.DeviceStatusOK
	}
	if distance, ok := s.distances[robotName]; ok {
		position.DistanceMeters = Float(distance.last)
		position.LastDistanceMeters = Float(distance.last)
		position.TotalDistanceMeters = Float(distance.total)
	}
	s.positions[robotName] = clonePosition(position)
	s.queuePositionLocked(position)
	s.broadcastLocked(position)
	s.mu.Unlock()
}

// UpdateDistance 根据设备当前开机累计值更新本次航程和历史总航程。
func (s *Store) UpdateDistance(robotName string, distanceMeters float64) {
	if distanceMeters < 0 || math.IsNaN(distanceMeters) || math.IsInf(distanceMeters, 0) {
		return
	}
	s.mu.Lock()
	distance, exists := s.distances[robotName]
	if !exists {
		distance = distanceState{last: distanceMeters, total: distanceMeters}
	} else if distanceMeters >= distance.last {
		distance.total += distanceMeters - distance.last
		distance.last = distanceMeters
	} else {
		// 船端每次开机会从零重新累计；读数下降表示新一轮开机航程。
		distance.last = distanceMeters
		distance.total += distanceMeters
	}
	s.distances[robotName] = distance
	position, ok := s.positions[robotName]
	if !ok {
		s.mu.Unlock()
		return
	}
	position.RobotName = robotName
	position.DistanceMeters = Float(distance.last)
	position.LastDistanceMeters = Float(distance.last)
	position.TotalDistanceMeters = Float(distance.total)
	position.ReceivedAtMS = time.Now().UnixMilli()
	s.positions[robotName] = clonePosition(position)
	s.queuePositionLocked(position)
	s.broadcastLocked(position)
	s.mu.Unlock()
}

// UpdateHeartbeat 更新设备心跳状态；状态只作为位置响应中的健康信息，不产生提示消息。
func (s *Store) UpdateHeartbeat(robotName, status string, lastAckAt int64, misses int) {
	s.mu.Lock()
	position, ok := s.positions[robotName]
	if ok {
		position.HeartbeatStatus = status
		position.HeartbeatLastAckAt = lastAckAt
		position.HeartbeatMisses = misses
		position.ReceivedAtMS = time.Now().UnixMilli()
		s.positions[robotName] = clonePosition(position)
		s.broadcastLocked(position)
	}
	s.mu.Unlock()
}

// Get 读取一台无人船的最新位置。
func (s *Store) Get(robotName string) (Position, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	position, ok := s.positions[robotName]
	return clonePosition(position), ok
}

// List 读取所有机器人最新位置。
func (s *Store) List() []Position {
	s.mu.RLock()
	defer s.mu.RUnlock()

	positions := make([]Position, 0, len(s.positions))
	for _, position := range s.positions {
		positions = append(positions, clonePosition(position))
	}
	sort.Slice(positions, func(i, j int) bool {
		return positions[i].RobotName < positions[j].RobotName
	})
	return positions
}

// SubscribeWithSnapshot 在同一个锁内取得初始快照并注册更新流，避免首帧和增量之间出现竞态。
func (s *Store) SubscribeWithSnapshot() ([]Position, <-chan Event, func()) {
	s.mu.Lock()
	id := s.nextSubID
	s.nextSubID++
	updates := make(chan Event, subscriberBufferSize)
	s.subscribers[id] = updates
	positions := make([]Position, 0, len(s.positions))
	for _, position := range s.positions {
		positions = append(positions, clonePosition(position))
	}
	sort.Slice(positions, func(i, j int) bool {
		return positions[i].RobotName < positions[j].RobotName
	})
	s.mu.Unlock()

	var once sync.Once
	cancel := func() {
		once.Do(func() {
			s.mu.Lock()
			if _, open := s.subscribers[id]; open {
				delete(s.subscribers, id)
				close(updates)
			}
			s.mu.Unlock()
		})
	}
	return positions, updates, cancel
}

func (s *Store) broadcastLocked(position Position) {
	s.broadcastEventLocked(Event{Position: clonePosition(position), Type: "position"})
}

func (s *Store) broadcastEventLocked(event Event) {
	for id, subscriber := range s.subscribers {
		select {
		case subscriber <- event:
		default:
			// Reconnect with a fresh snapshot rather than lose a deletion event.
			delete(s.subscribers, id)
			close(subscriber)
		}
	}
}
