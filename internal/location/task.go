// 文件作用：定义实时定位后台任务，当前维护演示位置，后续接入 MQTT/PostgreSQL。

package location

import (
	"context"
	"log/slog"
	"time"
)

// Task 周期性刷新机器人实时位置。
type Task struct {
	store    *Store
	interval time.Duration
	log      *slog.Logger
}

// NewTask 创建实时定位任务。
func NewTask(store *Store, interval time.Duration, log *slog.Logger) *Task {
	return &Task{
		store:    store,
		interval: interval,
		log:      log,
	}
}

// Start 启动实时定位任务。
// 当前阶段只维护一台演示机器人 H20-001 的位置，便于前端和接口联调。
func (t *Task) Start(ctx context.Context) {
	if t.interval <= 0 {
		t.interval = 5 * time.Second
	}

	t.refreshDemoPosition()
	ticker := time.NewTicker(t.interval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			t.log.Info("location task stopped")
			return
		case <-ticker.C:
			t.refreshDemoPosition()
		}
	}
}

func (t *Task) refreshDemoPosition() {
	now := time.Now().UTC()
	t.store.Update(Position{
		RobotCode: "H20-001",
		Latitude:  31.2304,
		Longitude: 121.4737,
		SpeedMPS:  0.8,
		Heading:   90,
		UpdatedAt: now,
	})
	t.log.Debug("robot location refreshed", slog.String("robot_code", "H20-001"), slog.Time("updated_at", now))
}
