// 文件作用：预留清洁任务模块访问数据库的位置，后续实现 missions 相关 SQL。

package mission

import "context"

// Repository 定义任务模块未来需要的持久化能力。
type Repository interface {
	List(ctx context.Context) ([]Mission, error)
	FindByID(ctx context.Context, id string) (Mission, error)
}
