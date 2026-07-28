// 文件作用：预留 PostgreSQL/PostGIS 连接和数据写入实现位置。

package db

import (
	"context"
	"errors"
)

// PostgresStore 是 PostgreSQL/PostGIS 访问逻辑未来的存放位置。
// 目前它是占位实现，使项目模板无需第三方依赖也能编译。
type PostgresStore struct {
	databaseURL string
}

// NewPostgresStore 记录连接字符串。
// 下一步实现应在这里创建 pgx 连接池。
func NewPostgresStore(databaseURL string) *PostgresStore {
	return &PostgresStore{databaseURL: databaseURL}
}

// Ping 验证数据库配置是否存在。
// 引入 pgx 后，将这里替换为实际的 SELECT 1 查询。
func (s *PostgresStore) Ping(_ context.Context) error {
	if s.databaseURL == "" {
		return errors.New("DATABASE_URL is empty")
	}
	return nil
}
