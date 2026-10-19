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
	opts.SetClientID("test-command-sender")
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

	// 下发油门指令到 websend 主题
	topic := "usv/USV-001/websend"

	// 左油门设置为 0
	leftThrottle := []int{39, 0, 0}
	payload1, _ := json.Marshal(leftThrottle)

	// 右油门设置为 0
	rightThrottle := []int{39, 1, 0}
	payload2, _ := json.Marshal(rightThrottle)

	fmt.Printf("\n📤 发送左油门指令到: %s\n", topic)
	fmt.Printf("📦 消息内容: %s (左油门=0)\n", string(payload1))

	token = client.Publish(topic, 1, false, payload1)
	token.Wait()
	if err := token.Error(); err != nil {
		log.Fatalf("发布消息失败: %v", err)
	}
	fmt.Println("✅ 左油门指令发送成功")

	time.Sleep(100 * time.Millisecond)

	fmt.Printf("\n📤 发送右油门指令到: %s\n", topic)
	fmt.Printf("📦 消息内容: %s (右油门=0)\n", string(payload2))

	token = client.Publish(topic, 1, false, payload2)
	token.Wait()
	if err := token.Error(); err != nil {
		log.Fatalf("发布消息失败: %v", err)
	}
	fmt.Println("✅ 右油门指令发送成功")

	fmt.Println("\n============================================================")
	fmt.Println("📋 请在MQTTX中添加订阅:")
	fmt.Println("   主题: usv/+/websend")
	fmt.Println("   QoS: 1")
	fmt.Println("============================================================")
	fmt.Println("\n你应该能看到上面发送的两条消息:")
	fmt.Println("   [39,0,0] - 左油门=0")
	fmt.Println("   [39,1,0] - 右油门=0")

	time.Sleep(2 * time.Second)
}
