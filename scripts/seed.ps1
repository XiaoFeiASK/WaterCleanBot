# 文件作用：提供加载开发测试种子数据的脚本。

# 将开发种子数据加载到本地数据库。
# 切勿在生产环境运行种子脚本。
psql $env:DATABASE_URL -f database/seeds/development_seed.sql
