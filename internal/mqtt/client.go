package mqtt

import "context"

// Client 将持有后端服务使用的 MQTT 连接。
// 首个真实版本应订阅遥测并发布机器人命令。
type Client struct {
	brokerURL string
}

// NewClient 创建占位的 MQTT 客户端配置。
func NewClient(brokerURL string) *Client {
	return &Client{brokerURL: brokerURL}
}

// Connect 是未来 MQTT 连接握手的占位实现。
func (c *Client) Connect(_ context.Context) error {
	_ = c.brokerURL
	return nil
}
