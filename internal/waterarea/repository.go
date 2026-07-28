// 文件作用：预留水域模块访问数据库的位置，后续实现 PostGIS 区域查询。

package waterarea

import "context"

// Repository 定义水域模块未来需要的持久化能力。
type Repository interface {
	List(ctx context.Context) ([]WaterArea, error)
	FindByID(ctx context.Context, id string) (WaterArea, error)
}
