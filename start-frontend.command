#!/bin/bash
source "$(dirname -- "$0")/scripts/start-common.sh"

require_file web/app/package.json

# Finder 不读取交互式 shell 配置，兼容通过 nvm 安装的 Node.js。
if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  nvm_script="${NVM_DIR:-$HOME/.nvm}/nvm.sh"
  if [ -s "$nvm_script" ]; then
    source "$nvm_script"
  fi
fi
command -v node >/dev/null 2>&1 || fail "未找到 Node.js，请先安装 Node.js，或为 nvm 设置默认版本。"
command -v npm >/dev/null 2>&1 || fail "未找到 npm，请检查 Node.js 安装。"

cd "$PROJECT_ROOT/web/app"
if [ ! -d node_modules ]; then
  printf '[信息] 正在安装前端依赖…\n'
  npm install
fi

printf '[信息] 前端地址：http://127.0.0.1:5175\n'
printf '[信息] 按 Ctrl+C 停止前端服务。\n'
npm run dev -- --host 127.0.0.1
