// 文件作用：预留告警模块访问数据库的位置，后续实现 alarms 相关 SQL。

package alarm

import "context"

// Repository 定义告警模块未来需要的持久化能力。
type Repository interface {
	ListOpen(ctx context.Context) ([]Alarm, error)
	MarkResolved(ctx context.Context, id string) error
}
