// 文件作用：预留通过 MQTT 向机器人发布控制命令的位置。

package mqtt

import "context"

// CommandPublisher 负责未来把后端命令发布到机器人 commands Topic。
type CommandPublisher struct {
	client *Client
}

// NewCommandPublisher 创建命令发布器骨架。
func NewCommandPublisher(client *Client) *CommandPublisher {
	return &CommandPublisher{client: client}
}

// PublishCommand 预留命令发布入口，后续接入真实 MQTT Publish。
func (p *CommandPublisher) PublishCommand(_ context.Context, robotCode string, payload []byte) error {
	_ = p.client
	_ = robotCode
	_ = payload
	return nil
}
