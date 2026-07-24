# 将开发种子数据加载到本地数据库。
# 切勿在生产环境运行种子脚本。
psql $env:DATABASE_URL -f database/seeds/development_seed.sql
