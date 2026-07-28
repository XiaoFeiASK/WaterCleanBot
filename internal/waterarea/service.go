// 文件作用：预留水域业务逻辑位置，后续处理区域管理、边界校验和空间查询。

package waterarea

// Service 承载水域管理相关业务规则。
type Service struct {
	repository Repository
}

// NewService 创建水域服务骨架。
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}
