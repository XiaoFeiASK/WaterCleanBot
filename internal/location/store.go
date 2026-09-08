// 文件作用：提供无人船实时位置的内存缓存，供 HTTP 接口快速读取。

package location

import (
	"sort"
	"sync"
)

// Store 保存每台无人船的最新位置。
type Store struct {
	mu        sync.RWMutex
	positions map[string]Position
	distances map[string]float64
}

// NewStore 创建实时位置存储。
func NewStore() *Store {
	return &Store{
		positions: make(map[string]Position),
		distances: make(map[string]float64),
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
	position.Actuators = previous.Actuators
	position.DeviceStatusOK = previous.DeviceStatusOK
}

// Update 写入或覆盖一台无人船的最新位置。
func (s *Store) Update(position Position) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if previous, ok := s.positions[position.RobotName]; ok {
		position.HeartbeatStatus = previous.HeartbeatStatus
		position.HeartbeatLastAckAt = previous.HeartbeatLastAckAt
		position.HeartbeatMisses = previous.HeartbeatMisses
		mergeFeedback(&position, previous)
	}
	if distance, ok := s.distances[position.RobotName]; ok {
		position.DistanceMeters = &distance
	}
	s.positions[position.RobotName] = position
}

// ReplaceAll 用一批最新位置整体替换内存缓存。
func (s *Store) ReplaceAll(positions []Position) {
	s.mu.Lock()
	defer s.mu.Unlock()

	next := make(map[string]Position, len(positions))
	for _, position := range positions {
		if previous, ok := s.positions[position.RobotName]; ok {
			position.HeartbeatStatus = previous.HeartbeatStatus
			position.HeartbeatLastAckAt = previous.HeartbeatLastAckAt
			position.HeartbeatMisses = previous.HeartbeatMisses
			mergeFeedback(&position, previous)
		}
		if distance, ok := s.distances[position.RobotName]; ok {
			position.DistanceMeters = &distance
		}
		next[position.RobotName] = position
	}
	s.positions = next
}

// UpdateNavigation 合并设备通过 [18,...] webfeedback 上报的导航定位信息。
func (s *Store) UpdateNavigation(position Position) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if previous, ok := s.positions[position.RobotName]; ok {
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
		position.Actuators = previous.Actuators
		position.DeviceStatusOK = previous.DeviceStatusOK
	}
	if distance, ok := s.distances[position.RobotName]; ok {
		position.DistanceMeters = &distance
	}
	s.positions[position.RobotName] = position
}

// UpdateFeedback 合并设备通过 webfeedback 上报的最新状态。
func (s *Store) UpdateFeedback(robotName string, feedback Position) {
	s.mu.Lock()
	defer s.mu.Unlock()
	position := s.positions[robotName]
	position.RobotName = robotName
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
		position.Actuators = feedback.Actuators
	}
	if feedback.DeviceStatusOK != nil {
		position.DeviceStatusOK = feedback.DeviceStatusOK
	}
	s.positions[robotName] = position
}

// UpdateDistance 写入设备最新的本次行驶里程反馈。
func (s *Store) UpdateDistance(robotName string, distanceMeters float64) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.distances[robotName] = distanceMeters
	if position, ok := s.positions[robotName]; ok {
		position.DistanceMeters = &distanceMeters
		s.positions[robotName] = position
	}
}

// UpdateHeartbeat 更新设备心跳状态；状态只作为位置响应中的健康信息，不产生提示消息。
func (s *Store) UpdateHeartbeat(robotName, status string, lastAckAt int64, misses int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	position, ok := s.positions[robotName]
	if !ok {
		return
	}
	position.HeartbeatStatus = status
	position.HeartbeatLastAckAt = lastAckAt
	position.HeartbeatMisses = misses
	s.positions[robotName] = position
}

// Get 读取一台无人船的最新位置。
func (s *Store) Get(robotName string) (Position, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	position, ok := s.positions[robotName]
	return position, ok
}

// List 读取所有机器人最新位置。
func (s *Store) List() []Position {
	s.mu.RLock()
	defer s.mu.RUnlock()

	positions := make([]Position, 0, len(s.positions))
	for _, position := range s.positions {
		positions = append(positions, position)
	}
	sort.Slice(positions, func(i, j int) bool {
		return positions[i].RobotName < positions[j].RobotName
	})
	return positions
}
