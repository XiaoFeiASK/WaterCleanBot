// 文件作用：预留订阅机器人命令 ACK 消息并更新命令状态的位置。

package mqtt

import "context"

// AckSubscriber 负责未来处理机器人返回的命令确认消息。
type AckSubscriber struct {
	client *Client
}

// NewAckSubscriber 创建 ACK 订阅器骨架。
func NewAckSubscriber(client *Client) *AckSubscriber {
	return &AckSubscriber{client: client}
}

// Start 预留 ACK 订阅入口，后续订阅 v1/robots/+/acks。
func (s *AckSubscriber) Start(_ context.Context) error {
	_ = s.client
	return nil
}
