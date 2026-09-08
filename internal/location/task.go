// 文件作用：后端启动时从 PostgreSQL 恢复最后位置快照。

package location

import (
	"context"
	"fmt"
)

// LoadInitialPositions 在 MQTT 订阅启动前执行一次。运行期间不再让数据库覆盖实时内存。
func LoadInitialPositions(ctx context.Context, store *Store, repository *Repository) error {
	positions, err := repository.ListCurrentPositions(ctx)
	if err != nil {
		return fmt.Errorf("list initial robot positions: %w", err)
	}
	store.LoadInitial(positions)
	return nil
}
