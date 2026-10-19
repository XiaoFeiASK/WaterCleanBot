#!/bin/bash
# macOS 启动入口共用：固定工作目录，补充 Finder 启动时的 PATH，并保留结果窗口。
set -euo pipefail

export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.docker/bin:$PATH"
PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"

finish() {
  local status=$?
  trap - EXIT
  if [ "$status" -ne 0 ]; then
    printf '\n[错误] 启动未完成（退出码 %s），请查看上方提示。\n' "$status" >&2
  fi
  if [ -t 0 ] && [ -t 1 ]; then
    read -r -p "按回车键关闭此窗口…" _ || true
  fi
  exit "$status"
}
trap finish EXIT

fail() {
  printf '[错误] %s\n' "$*" >&2
  exit 1
}

require_file() {
  [ -f "$1" ] || fail "找不到 $1，请保留完整的项目目录。"
}

require_docker() {
  command -v docker >/dev/null 2>&1 || fail "未找到 Docker，请先安装并打开 Docker Desktop。"
  docker compose version >/dev/null 2>&1 || fail "未找到 Docker Compose，请检查 Docker Desktop 安装。"
  docker info >/dev/null 2>&1 || fail "无法连接 Docker，请先打开 Docker Desktop 并等待其启动完成。"
}
