@echo off
setlocal

rem 一键启动 web/app 前端开发服务器。
cd /d "%~dp0"

if not exist "web\app\package.json" (
  echo [ERROR] 未找到 web\app\package.json
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 Node.js，请先安装 Node.js。
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] 未检测到 npm，请确认 Node.js 已正确安装。
  pause
  exit /b 1
)

if not exist "web\app\node_modules" (
  echo [INFO] 首次启动，正在安装前端依赖...
  call npm install --prefix "web\app"
  if errorlevel 1 (
    echo [ERROR] 前端依赖安装失败。
    pause
    exit /b 1
  )
)

echo [INFO] 前端启动地址：http://127.0.0.1:5173
echo [INFO] 按 Ctrl+C 可以停止前端服务。
cd /d "%~dp0web\app"
call npm run dev -- --host 127.0.0.1

pause
