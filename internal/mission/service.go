// 文件作用：预留清洁任务业务逻辑位置，后续处理任务创建、调度和执行状态。

package mission

// Service 承载任务管理相关业务规则。
type Service struct {
	repository Repository
}

// NewService 创建任务服务骨架。
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}
