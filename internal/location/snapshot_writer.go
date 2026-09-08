// 文件作用：将实时内存中的最新位置按设备合并，并低频异步持久化到 PostgreSQL。

package location

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

const defaultPersistenceInterval = time.Second

// SnapshotRepository 是异步快照写入器依赖的最小数据库能力。
type SnapshotRepository interface {
	UpsertCurrentPosition(context.Context, Position, int64) (bool, error)
}

type pendingSnapshot struct {
	position     Position
	receivedAtMS int64
}

// SnapshotWriter 的 Submit 永不等待数据库；同一设备只保留尚未持久化的最新快照。
type SnapshotWriter struct {
	repository SnapshotRepository
	interval   time.Duration
	log        *slog.Logger

	mu      sync.Mutex
	pending map[string]pendingSnapshot
}

func NewSnapshotWriter(repository SnapshotRepository, interval time.Duration, log *slog.Logger) *SnapshotWriter {
	if interval <= 0 {
		interval = defaultPersistenceInterval
	}
	return &SnapshotWriter{
		repository: repository,
		interval:   interval,
		log:        log,
		pending:    make(map[string]pendingSnapshot),
	}
}

// Submit 按服务端接收时间合并同一设备的待写快照，避免不同设备时钟影响持久化顺序。
func (w *SnapshotWriter) Submit(position Position) {
	if position.RobotName == "" {
		return
	}
	if position.ReceivedAtMS <= 0 {
		position.ReceivedAtMS = time.Now().UnixMilli()
	}

	w.mu.Lock()
	current, exists := w.pending[position.RobotName]
	if !exists || position.ReceivedAtMS >= current.receivedAtMS {
		w.pending[position.RobotName] = pendingSnapshot{position: clonePosition(position), receivedAtMS: position.ReceivedAtMS}
	}
	w.mu.Unlock()
}

// Start 周期性落盘；退出时在给定上下文有效期内进行最后一次 flush。
func (w *SnapshotWriter) Start(ctx context.Context) {
	ticker := time.NewTicker(w.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			flushCtx, cancel := context.WithTimeout(context.Background(), currentPositionQueryTimeout)
			w.flush(flushCtx)
			cancel()
			return
		case <-ticker.C:
			w.flush(ctx)
		}
	}
}

func (w *SnapshotWriter) flush(ctx context.Context) {
	batch := w.takePending()
	for robotName, snapshot := range batch {
		updated, err := w.repository.UpsertCurrentPosition(ctx, snapshot.position, snapshot.receivedAtMS)
		if err != nil {
			w.log.Error("persist robot location snapshot failed", slog.String("robot_name", robotName), slog.Any("error", err))
			w.requeue(robotName, snapshot)
			continue
		}
		if !updated {
			w.log.Debug("stale robot location snapshot skipped", slog.String("robot_name", robotName), slog.Int64("timestamp", snapshot.receivedAtMS))
		}
	}
}

func (w *SnapshotWriter) takePending() map[string]pendingSnapshot {
	w.mu.Lock()
	defer w.mu.Unlock()
	batch := w.pending
	w.pending = make(map[string]pendingSnapshot)
	return batch
}

func (w *SnapshotWriter) requeue(robotName string, snapshot pendingSnapshot) {
	w.mu.Lock()
	defer w.mu.Unlock()
	current, exists := w.pending[robotName]
	if !exists || snapshot.receivedAtMS > current.receivedAtMS {
		w.pending[robotName] = snapshot
	}
}
