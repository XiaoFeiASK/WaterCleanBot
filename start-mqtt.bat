@echo off
setlocal

cd /d "%~dp0"

if not exist "docker-compose.mqtt.yml" (
  echo [ERROR] docker-compose.mqtt.yml was not found.
  pause
  exit /b 1
)

where docker >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Docker was not found. Please install or start Docker Desktop first.
  pause
  exit /b 1
)

echo [INFO] Starting local MQTT broker...
call docker compose -f docker-compose.mqtt.yml up -d mqtt
if errorlevel 1 (
  echo [ERROR] Local MQTT startup failed. Please make sure Docker Desktop is running and port 1883 is free.
  pause
  exit /b 1
)

call docker compose -f docker-compose.mqtt.yml ps mqtt

echo.
echo [INFO] Local MQTT broker startup command completed.
echo [INFO] To use it, set MQTT_BROKER_URL=tcp://localhost:1883 in .env.
pause
