@echo off
setlocal

cd /d "%~dp0"

if not exist "docker-compose.video.yml" (
  echo [ERROR] docker-compose.video.yml was not found.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env was not found. Please create it and set CAMERA_FRONT_RTSP and CAMERA_REAR_RTSP first.
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker was not found. Please install or start Docker Desktop first.
  pause
  exit /b 1
)

echo [INFO] Starting MediaMTX video relay and reloading .env...
call docker compose -f docker-compose.video.yml up -d --force-recreate mediamtx
if errorlevel 1 (
  echo [ERROR] MediaMTX startup failed. Please make sure Docker Desktop is running and ports 8554/8888/8889 are free.
  pause
  exit /b 1
)

call docker compose -f docker-compose.video.yml ps mediamtx

echo.
echo [INFO] MediaMTX startup command completed. Container was recreated so .env changes are applied.
echo [INFO] HLS front stream: http://localhost:8888/front/index.m3u8
echo [INFO] HLS rear stream:  http://localhost:8888/rear/index.m3u8
echo [INFO] Frontend dev server proxies /video to http://localhost:8888.
pause
