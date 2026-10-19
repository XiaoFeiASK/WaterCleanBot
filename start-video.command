#!/bin/bash
source "$(dirname -- "$0")/scripts/start-common.sh"

require_file docker-compose.video.yml
[ -f .env ] || fail "请先复制 .env.example 为 .env，并配置 CAMERA_FRONT_RTSP、CAMERA_REAR_RTSP 和 CAMERA_HLS_CDN_SECRET。"
require_docker

# 交给 Compose 校验必填环境变量，不执行 .env，也不打印其中的摄像头密码。
if ! docker compose -f docker-compose.video.yml config --quiet; then
  fail "视频配置无效，请检查 .env 中两路摄像头地址及 CAMERA_HLS_CDN_SECRET；密钥可用 openssl rand -hex 24 生成。"
fi

printf '[信息] 正在重建 MediaMTX 及 H.265 → H.264 转码服务，使 .env 配置生效…\n'
docker compose -f docker-compose.video.yml up -d --force-recreate mediamtx
docker compose -f docker-compose.video.yml up -d --force-recreate transcode-front transcode-rear
docker compose -f docker-compose.video.yml ps

printf '\n[信息] 视频服务启动命令已完成。\n'
printf '[信息] 前摄像头 HLS：http://localhost:8888/front/index.m3u8\n'
printf '[信息] 后摄像头 HLS：http://localhost:8888/rear/index.m3u8\n'
printf '[信息] 前端开发服务器通过 /video 代理到 http://localhost:8888。\n'
printf '[信息] 生产环境 nginx /video/ 需注入与 CAMERA_HLS_CDN_SECRET 一致的 Bearer 请求头。\n'
