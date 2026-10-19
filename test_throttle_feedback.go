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
	opts.SetClientID("test-throttle-feedback")
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

	// 发送油门反馈消息
	topic := "usv/USV-001/webfeedback"

	// 消息格式: [21, 电池电量, 左油门, 右油门]
	message := []int{21, 92, 30, 45}
	payload, _ := json.Marshal(message)

	fmt.Printf("📤 发送油门反馈到主题: %s\n", topic)
	fmt.Printf("📦 消息内容: %s\n", string(payload))
	fmt.Printf("   - 消息类型: 21 (油门+电池反馈)\n")
	fmt.Printf("   - 电池电量: 92%%\n")
	fmt.Printf("   - 左油门: 30%%\n")
	fmt.Printf("   - 右油门: 45%%\n")

	token = client.Publish(topic, 1, false, payload)
	token.Wait()
	if err := token.Error(); err != nil {
		log.Fatalf("发布消息失败: %v", err)
	}

	fmt.Println("\n✅ 消息发送成功")
	fmt.Println("\n请检查:")
	fmt.Println("1. MQTTX 订阅了 usv/+/webfeedback 主题")
	fmt.Println("2. 网页上的油门反馈显示是否更新为 30% 和 45%")

	time.Sleep(2 * time.Second)
}
