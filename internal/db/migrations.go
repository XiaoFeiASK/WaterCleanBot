// 文件作用：记录数据库迁移目录常量，供后续迁移工具接入。

package db

// MigrationsDir 记录 SQL 迁移文件所在位置。
// 生产环境应通过专用迁移工具或发布步骤执行迁移。
const MigrationsDir = "database/migrations"
