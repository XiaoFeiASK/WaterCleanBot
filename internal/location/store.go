// 文件作用：提供实时位置的内存存储，后续可替换为 PostgreSQL/PostGIS 查询。

package location

import "sync"

// Store 保存每台机器人的最新位置。
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

// Update 写入或覆盖一台机器人的最新位置。
func (s *Store) Update(position Position) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.positions[position.RobotCode] = position
}

// Get 读取一台机器人的最新位置。
func (s *Store) Get(robotCode string) (Position, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	position, ok := s.positions[robotCode]
	return position, ok
}
