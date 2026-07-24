# 创建本地 PostgreSQL 备份。
# 生产备份应由服务器自动化执行，并复制到主机外部。
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
pg_dump $env:DATABASE_URL -Fc -f "tmp/waterbot-$timestamp.dump"
