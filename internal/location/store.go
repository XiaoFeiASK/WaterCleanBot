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
}

// NewStore 创建实时位置存储。
func NewStore() *Store {
	return &Store{
		positions: make(map[string]Position),
	}
}

// Update 写入或覆盖一台无人船的最新位置。
func (s *Store) Update(position Position) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.positions[position.RobotName] = position
}

// ReplaceAll 用一批最新位置整体替换内存缓存。
func (s *Store) ReplaceAll(positions []Position) {
	s.mu.Lock()
	defer s.mu.Unlock()

	next := make(map[string]Position, len(positions))
	for _, position := range positions {
		next[position.RobotName] = position
	}
	s.positions = next
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
