@echo off
setlocal

cd /d "%~dp0"

if not exist "docker-compose.video.yml" (
  echo [ERROR] docker-compose.video.yml was not found.
  pause
  exit /b 1
)

if not exist ".env" (
  echo [ERROR] .env was not found. Please create it and set CAMERA_FRONT_RTSP, CAMERA_REAR_RTSP and CAMERA_HLS_CDN_SECRET first.
  pause
  exit /b 1
)

findstr /B /C:"CAMERA_HLS_CDN_SECRET=" ".env" >nul
if errorlevel 1 (
  echo [ERROR] CAMERA_HLS_CDN_SECRET is missing in .env. Generate one with: openssl rand -hex 24
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker was not found. Please install or start Docker Desktop first.
  pause
  exit /b 1
)

echo [INFO] Starting MediaMTX video relay + H.265->H.264 transcode, reloading .env...
call docker compose -f docker-compose.video.yml up -d --force-recreate mediamtx
if errorlevel 1 (
  echo [ERROR] MediaMTX startup failed. Please make sure Docker Desktop is running and ports 8554/8888/8889 are free.
  pause
  exit /b 1
)

call docker compose -f docker-compose.video.yml up -d --force-recreate transcode-front transcode-rear
if errorlevel 1 (
  echo [ERROR] Transcode startup failed. Check Docker logs for watercleanbot-transcode-front / watercleanbot-transcode-rear.
  pause
  exit /b 1
)

call docker compose -f docker-compose.video.yml ps

echo.
echo [INFO] Video pipeline started. MediaMTX + transcode containers were recreated so .env changes are applied.
echo [INFO] Cameras are H.265, so playback paths /front and /rear are the H.264 transcoded outputs.
echo [INFO] HLS front stream: http://localhost:8888/front/index.m3u8
echo [INFO] HLS rear stream:  http://localhost:8888/rear/index.m3u8
echo [INFO] The HLS session key is CAMERA_HLS_CDN_SECRET; the site nginx /video/ must inject the matching Authorization: Bearer header.
echo [INFO] Frontend dev server proxies /video to http://localhost:8888.
pause
