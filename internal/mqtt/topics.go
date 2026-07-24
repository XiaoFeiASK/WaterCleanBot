package mqtt

import "fmt"

// TelemetryTopic returns the topic a robot publishes telemetry to.
func TelemetryTopic(robotCode string) string {
	return fmt.Sprintf("v1/robots/%s/telemetry", robotCode)
}

// CommandTopic returns the topic a robot subscribes to for backend commands.
func CommandTopic(robotCode string) string {
	return fmt.Sprintf("v1/robots/%s/commands", robotCode)
}

// AckTopic returns the topic a robot publishes command acknowledgements to.
func AckTopic(robotCode string) string {
	return fmt.Sprintf("v1/robots/%s/acks", robotCode)
}
