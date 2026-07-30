@echo off
rem 文件作用：一键启动本地 PostgreSQL/PostGIS 数据库容器。

cd /d "%~dp0"

docker compose up -d postgres
if errorlevel 1 (
    echo.
    echo 数据库启动失败，请确认 Docker Desktop 已启动。
    pause
    exit /b 1
)

docker compose ps postgres

echo.
echo 数据库启动命令已执行完成。
pause
