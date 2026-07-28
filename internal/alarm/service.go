// 文件作用：预留告警业务逻辑位置，后续处理阈值判断、告警生成和告警关闭。

package alarm

// Service 承载告警管理相关业务规则。
type Service struct {
	repository Repository
}

// NewService 创建告警服务骨架。
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}
