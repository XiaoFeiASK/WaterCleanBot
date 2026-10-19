#!/bin/bash
source "$(dirname -- "$0")/scripts/start-common.sh"

require_file docker-compose.yml
require_docker

printf '[信息] 正在启动 PostgreSQL/PostGIS 数据库…\n'
docker compose -f docker-compose.yml up -d postgres
docker compose -f docker-compose.yml ps postgres
printf '\n[信息] 数据库启动命令已完成，连接端口为 5432。\n'
