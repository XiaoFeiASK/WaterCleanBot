@echo off
setlocal

cd /d "%~dp0"

if not exist "web\app\package.json" (
  echo [ERROR] web\app\package.json was not found.
  pause
  exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js was not found. Please install Node.js first.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo [ERROR] npm was not found. Please check the Node.js installation.
  pause
  exit /b 1
)

cd /d "%~dp0web\app"

if not exist "node_modules" (
  echo [INFO] Installing frontend dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] Frontend dependency installation failed.
    pause
    exit /b 1
  )
)

echo [INFO] Frontend URL: http://127.0.0.1:5175
echo [INFO] Press Ctrl+C to stop the frontend server.
call npm run dev -- --host 127.0.0.1

pause
