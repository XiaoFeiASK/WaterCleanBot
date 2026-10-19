#!/bin/bash
source "$(dirname -- "$0")/scripts/start-common.sh"

require_file docker-compose.mqtt.yml
require_docker

printf '[信息] 正在启动本地 MQTT Broker…\n'
docker compose -f docker-compose.mqtt.yml up -d mqtt
docker compose -f docker-compose.mqtt.yml ps mqtt
printf '\n[信息] MQTT 启动命令已完成，TCP 端口 1883，WebSocket 端口 9001。\n'
printf '[信息] 使用本地 Broker 时，请在 .env 设置 MQTT_BROKER_URL=tcp://localhost:1883。\n'
