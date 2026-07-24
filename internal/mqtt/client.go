package mqtt

import "context"

// Client will own the MQTT connection used by the backend service.
// The first real version should subscribe to telemetry and publish robot commands.
type Client struct {
	brokerURL string
}

// NewClient creates a placeholder MQTT client configuration.
func NewClient(brokerURL string) *Client {
	return &Client{brokerURL: brokerURL}
}

// Connect is a placeholder for the future MQTT connection handshake.
func (c *Client) Connect(_ context.Context) error {
	_ = c.brokerURL
	return nil
}
