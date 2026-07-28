# 文件作用：提供本地数据库恢复命令占位。

# 将 PostgreSQL 备份恢复到目标数据库。
# 运行此脚本前请仔细核对目标 DATABASE_URL。
param(
    [Parameter(Mandatory=$true)]
    [string]$BackupPath
)

pg_restore --clean --if-exists --dbname $env:DATABASE_URL $BackupPath
