package robot

import "context"

// Repository 将包含 robots 表的 SQL 查询。
// 保持 SQL 显式，确保索引、PostGIS 使用和事务保持可见。
type Repository interface {
	List(ctx context.Context) ([]Robot, error)
	FindByCode(ctx context.Context, code string) (Robot, error)
}
