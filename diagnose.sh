#!/bin/bash

echo "🔍 开始诊断 WaterCleanBot 系统..."
echo ""

# 1. 检查后端是否在运行
echo "1️⃣ 检查后端服务 (端口 8080)..."
if lsof -i :8080 > /dev/null 2>&1; then
    echo "✅ 后端服务正在运行"
    PID=$(lsof -ti :8080)
    echo "   进程ID: $PID"
else
    echo "❌ 后端服务未运行"
    echo "   请运行: go run cmd/watercleanbot/main.go"
fi
echo ""

# 2. 检查前端是否在运行
echo "2️⃣ 检查前端服务 (端口 5173)..."
if lsof -i :5173 > /dev/null 2>&1; then
    echo "✅ 前端服务正在运行"
    PID=$(lsof -ti :5173)
    echo "   进程ID: $PID"
else
    echo "❌ 前端服务未运行"
    echo "   请在 web/app 目录运行: npm run dev"
fi
echo ""

# 3. 检查数据库连接
echo "3️⃣ 检查数据库 (端口 5432)..."
if lsof -i :5432 > /dev/null 2>&1; then
    echo "✅ PostgreSQL 正在运行"
else
    echo "❌ PostgreSQL 未运行"
    echo "   请运行: docker-compose up -d"
fi
echo ""

# 4. 检查MQTT broker连接
echo "4️⃣ 检查MQTT broker..."
if nc -zv -w 2 101.35.101.135 1883 2>&1 | grep -q succeeded; then
    echo "✅ MQTT broker 可以连接 (101.35.101.135:1883)"
else
    echo "❌ MQTT broker 无法连接"
fi
echo ""

# 5. 测试API端点
echo "5️⃣ 测试后端API..."
if curl -s http://localhost:8080/api/robots/USV-001/location > /dev/null 2>&1; then
    echo "✅ 后端API可访问"
    echo "   USV-001位置信息:"
    curl -s http://localhost:8080/api/robots/USV-001/location | jq -r '   {lat: .lat, lng: .lng, battery: .battery}' 2>/dev/null || echo "   (需要安装jq查看详情)"
else
    echo "❌ 后端API无法访问"
fi
echo ""

# 6. 发送测试MQTT消息
echo "6️⃣ 发送测试MQTT消息..."
if command -v go &> /dev/null; then
    echo "   正在发送测试消息..."
    go run test_mqtt.go 2>&1 | grep -E "(✅|❌|📤)"
else
    echo "❌ Go未安装，无法发送测试消息"
fi
echo ""

echo "📋 诊断完成！"
echo ""
echo "💡 接下来的步骤："
echo "1. 如果后端未运行，请在项目根目录运行: go run cmd/watercleanbot/main.go"
echo "2. 如果前端未运行，请在 web/app 目录运行: npm run dev"
echo "3. 等待几秒后，刷新浏览器页面（Ctrl+Shift+R 强制刷新）"
echo "4. 查看船只位置是否更新到 30.274084, 120.155070"
