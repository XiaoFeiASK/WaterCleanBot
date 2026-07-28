// 文件作用：预留认证授权业务逻辑位置，后续处理登录、角色校验和数据权限。

package auth

// Service 承载账号、角色和权限相关业务规则。
type Service struct {
	repository Repository
}

// NewService 创建认证授权服务骨架。
func NewService(repository Repository) *Service {
	return &Service{repository: repository}
}
