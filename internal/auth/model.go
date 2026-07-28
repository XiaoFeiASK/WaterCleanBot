// 文件作用：定义账号、角色、权限等认证授权模块的基础数据模型占位。

package auth

// User 表示未来管理后台登录用户的基础信息。
type User struct {
	ID       string
	Username string
	RoleID   string
	Status   string
}

// Role 表示未来权限控制中的角色。
type Role struct {
	ID          string
	Name        string
	Description string
}
