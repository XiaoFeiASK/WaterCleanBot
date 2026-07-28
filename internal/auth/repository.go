// 文件作用：预留认证授权模块访问数据库的位置，后续实现 users、roles、permissions 查询。

package auth

import "context"

// Repository 定义认证授权模块未来需要的持久化能力。
type Repository interface {
	FindUserByUsername(ctx context.Context, username string) (User, error)
	ListRoles(ctx context.Context) ([]Role, error)
}
