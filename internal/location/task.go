// 文件作用：定义实时定位后台任务，从 PostgreSQL 刷新机器人当前位置缓存。

package location

import (
	"context"
	"log/slog"
	"time"
)

// Task 周期性刷新无人船实时位置。
type Task struct {
	store      *Store
	repository *Repository
	interval   time.Duration
	log        *slog.Logger
}

// NewTask 创建实时定位任务。
func NewTask(store *Store, repository *Repository, interval time.Duration, log *slog.Logger) *Task {
	return &Task{
		store:      store,
		repository: repository,
		interval:   interval,
		log:        log,
	}
}

// Start 启动实时定位任务。
// 任务会周期性读取 robot_current_locations 表，并更新 HTTP 接口使用的内存缓存。
func (t *Task) Start(ctx context.Context) {
	if t.interval <= 0 {
		t.interval = 5 * time.Second
	}

	t.refreshPositions(ctx)
	ticker := time.NewTicker(t.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			t.log.Info("location task stopped")
			return
		case <-ticker.C:
			t.refreshPositions(ctx)
		}
	}
}

func (t *Task) refreshPositions(ctx context.Context) {
	positions, err := t.repository.ListCurrentPositions(ctx)
	if err != nil {
		t.log.Error("query robot locations failed", slog.Any("error", err))
		return
	}

	t.store.ReplaceAll(positions)
	t.log.Debug("robot locations refreshed", slog.Int("count", len(positions)))
}
