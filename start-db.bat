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

echo [INFO] Starting PostgreSQL/PostGIS database...
call docker compose up -d postgres
if errorlevel 1 (
  echo [ERROR] Database startup failed. Please make sure Docker Desktop is running.
  pause
  exit /b 1
)

call docker compose ps postgres

echo.
echo [INFO] Database startup command completed.
pause
