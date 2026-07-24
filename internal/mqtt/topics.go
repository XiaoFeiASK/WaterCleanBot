package mqtt

import "fmt"

// TelemetryTopic 返回机器人发布遥测的主题。
func TelemetryTopic(robotCode string) string {
	return fmt.Sprintf("v1/robots/%s/telemetry", robotCode)
}

// CommandTopic 返回机器人订阅后端命令的主题。
func CommandTopic(robotCode string) string {
	return fmt.Sprintf("v1/robots/%s/commands", robotCode)
}

// AckTopic 返回机器人发布命令确认的主题。
func AckTopic(robotCode string) string {
	return fmt.Sprintf("v1/robots/%s/acks", robotCode)
}
