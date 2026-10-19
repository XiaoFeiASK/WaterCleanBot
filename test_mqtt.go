package main

import (
	"encoding/json"
	"fmt"
	"log"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

func main() {
	// 连接到MQTT broker
	opts := mqtt.NewClientOptions()
	opts.AddBroker("tcp://101.35.101.135:1883")
	opts.SetClientID("test-publisher")
	opts.SetUsername("")
	opts.SetPassword("")

	client := mqtt.NewClient(opts)
	token := client.Connect()
	token.Wait()
	if err := token.Error(); err != nil {
		log.Fatalf("连接MQTT失败: %v", err)
	}
	defer client.Disconnect(250)

	fmt.Println("✅ 成功连接到MQTT broker")

	// 发送测试消息
	topic := "usv/USV-001/telemetry"
	message := map[string]interface{}{
		"usvId":     "USV-001",
		"lat":       30.274084,
		"lng":       120.155070,
		"heading":   90.5,
		"speed":     1.5,
		"battery":   92.0,
		"status":    1,
		"timestamp": time.Now().UnixMilli(),
	}

	payload, _ := json.Marshal(message)

	fmt.Printf("📤 发送消息到主题: %s\n", topic)
	fmt.Printf("📦 消息内容: %s\n", string(payload))

	token = client.Publish(topic, 1, false, payload)
	token.Wait()
	if err := token.Error(); err != nil {
		log.Fatalf("发布消息失败: %v", err)
	}

	fmt.Println("✅ 消息发送成功")
	fmt.Println("\n请检查:")
	fmt.Println("1. 后端日志是否显示收到消息")
	fmt.Println("2. 网页是否更新了船只位置")
	fmt.Println("3. MQTTX是否收到了这条消息")

	time.Sleep(2 * time.Second)
}
