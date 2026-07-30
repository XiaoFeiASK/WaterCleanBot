// 文件作用：定义实时定位后台任务，当前维护演示位置，后续接入 MQTT/PostgreSQL。

package location

import (
	"context"
	"log/slog"
	"time"
)

// Task 周期性刷新无人船实时位置。
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
// 当前阶段只维护一台演示机器人“清澜一号”的位置，便于前端和接口联调。
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
	t.store.Update(Position{
		RobotName: "清澜一号",
		Lat:       31.07,
		Lng:       120.88,
		Heading:   135.0,
		Speed:     2.3,
		Battery:   68.0,
		Status:    1,
	})
	t.log.Debug("robot location refreshed", slog.String("robot_name", "清澜一号"))
}
