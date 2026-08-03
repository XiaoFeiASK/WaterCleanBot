@echo off
setlocal

cd /d "%~dp0"

if not exist "docker-compose.yml" (
  echo [ERROR] docker-compose.yml was not found.
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker was not found. Please install or start Docker Desktop first.
  pause
  exit /b 1
)

echo [INFO] Starting PostgreSQL/PostGIS database and MQTT broker...
call docker compose up -d postgres mqtt
if errorlevel 1 (
  echo [ERROR] Local service startup failed. Please make sure Docker Desktop is running.
  pause
  exit /b 1
)

call docker compose ps postgres mqtt

echo.
echo [INFO] Database and MQTT startup command completed.
pause
