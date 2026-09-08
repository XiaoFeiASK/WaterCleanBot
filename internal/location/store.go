// 文件作用：提供无人船实时状态内存缓存，并向 SSE 客户端广播变化。

package location

import (
	"sort"
	"sync"
	"time"
)

const subscriberBufferSize = 64

// Store 保存每台无人船的最新位置。它是运行期间实时状态的唯一数据源。
type Store struct {
	mu                 sync.RWMutex
	positions          map[string]Position
	distances          map[string]float64
	telemetryVersions  map[string]int64
	navigationVersions map[string]int64
	latestReceivedAtMS map[string]int64
	subscribers        map[uint64]chan Position
	nextSubID          uint64
}

// NewStore 创建实时位置存储。
func NewStore() *Store {
	return &Store{
		positions:          make(map[string]Position),
		distances:          make(map[string]float64),
		telemetryVersions:  make(map[string]int64),
		navigationVersions: make(map[string]int64),
		latestReceivedAtMS: make(map[string]int64),
		subscribers:        make(map[uint64]chan Position),
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
		position.DistanceMeters = &distance
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
	s.broadcastLocked(position)
	s.mu.Unlock()
	return clonePosition(position), true
}

// LoadInitial 用数据库快照初始化内存。它只能在 MQTT 订阅启动前调用。
func (s *Store) LoadInitial(positions []Position) {
	s.mu.Lock()
	defer s.mu.Unlock()

	next := make(map[string]Position, len(positions))
	for _, position := range positions {
		next[position.RobotName] = clonePosition(position)
	}
	s.positions = next
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
		position.DistanceMeters = &distance
	}
	s.positions[position.RobotName] = clonePosition(position)
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
	if feedback.Battery != 0 {
		position.Battery = feedback.Battery
	}
	if feedback.Actuators != nil {
		position.Actuators = cloneActuators(feedback.Actuators)
	}
	if feedback.DeviceStatusOK != nil {
		position.DeviceStatusOK = feedback.DeviceStatusOK
	}
	s.positions[robotName] = clonePosition(position)
	s.broadcastLocked(position)
	s.mu.Unlock()
}

// UpdateDistance 写入设备最新的本次行驶里程反馈。
func (s *Store) UpdateDistance(robotName string, distanceMeters float64) {
	s.mu.Lock()
	s.distances[robotName] = distanceMeters
	if position, ok := s.positions[robotName]; ok {
		position.DistanceMeters = &distanceMeters
		position.ReceivedAtMS = time.Now().UnixMilli()
		s.positions[robotName] = clonePosition(position)
		s.broadcastLocked(position)
	}
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
func (s *Store) SubscribeWithSnapshot() ([]Position, <-chan Position, func()) {
	s.mu.Lock()
	id := s.nextSubID
	s.nextSubID++
	updates := make(chan Position, subscriberBufferSize)
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
			delete(s.subscribers, id)
			close(updates)
			s.mu.Unlock()
		})
	}
	return positions, updates, cancel
}

func (s *Store) broadcastLocked(position Position) {
	position = clonePosition(position)
	for _, subscriber := range s.subscribers {
		select {
		case subscriber <- position:
		default:
			// 慢客户端只需要最新状态；丢弃其队列中最旧的一条后重试。
			select {
			case <-subscriber:
			default:
			}
			select {
			case subscriber <- position:
			default:
			}
		}
	}
}
