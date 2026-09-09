// 文件作用：连接 MQTT Broker，把后端校验后的遥控指令发布到对应无人艇 topic。

package control

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const commandQoS byte = 1

// PublisherConfig 是 MQTT 指令发布器的运行配置。
type PublisherConfig struct {
	BrokerURL             string
	ClientID              string
	TopicTemplate         string
	RouteTopicTemplate    string
	FeedbackTopicTemplate string
	Username              string
	Password              string
}

// Publisher 负责把遥控指令和航线协议发布到 usv/{robotName}/web。
type Publisher struct {
	config PublisherConfig
	log    *slog.Logger
	client mqtt.Client
	seq    atomic.Uint64
}

// NewPublisher 创建 MQTT 指令发布器。
func NewPublisher(config PublisherConfig, log *slog.Logger) *Publisher {
	return &Publisher{
		config: config,
		log:    log,
	}
}

// Start 连接 MQTT Broker，并在进程退出时断开连接。
func (p *Publisher) Start(ctx context.Context) error {
	if p.config.BrokerURL == "" {
		return fmt.Errorf("mqtt broker url is required")
	}
	if p.config.ClientID == "" {
		p.config.ClientID = "watercleanbot-command-publisher"
	}
	if p.config.TopicTemplate == "" {
		p.config.TopicTemplate = "usv/%s/websend"
	}
	if !strings.Contains(p.config.TopicTemplate, "%s") {
		return fmt.Errorf("mqtt command topic template must contain %%s")
	}
	if p.config.RouteTopicTemplate == "" {
		p.config.RouteTopicTemplate = "usv/%s/websend"
	}
	if !strings.Contains(p.config.RouteTopicTemplate, "%s") {
		return fmt.Errorf("mqtt route topic template must contain %%s")
	}
	if p.config.FeedbackTopicTemplate == "" {
		p.config.FeedbackTopicTemplate = "usv/+/webfeedback"
	}

	options := mqtt.NewClientOptions()
	options.AddBroker(p.config.BrokerURL)
	options.SetClientID(p.config.ClientID)
	options.SetUsername(p.config.Username)
	options.SetPassword(p.config.Password)
	options.SetAutoReconnect(true)
	options.SetConnectTimeout(5 * time.Second)
	options.SetConnectionLostHandler(func(_ mqtt.Client, err error) {
		p.log.Warn("mqtt command publisher connection lost", slog.Any("error", err))
	})
	options.SetOnConnectHandler(func(client mqtt.Client) {
		p.log.Info("mqtt command publisher connected")
	})

	p.client = mqtt.NewClient(options)
	token := p.client.Connect()
	token.Wait()
	if err := token.Error(); err != nil {
		return fmt.Errorf("connect mqtt broker for command publisher: %w", err)
	}

	go func() {
		<-ctx.Done()
		p.client.Disconnect(250)
		p.log.Info("mqtt command publisher stopped")
	}()

	return nil
}

// PublishRemoteCommand 封装并发布一条遥控指令。
func (p *Publisher) PublishRemoteCommand(ctx context.Context, target string, request RemoteCommandRequest) (RemoteCommandEnvelope, error) {
	command, err := BuildRemoteCommand(target, p.seq.Add(1), request)
	if err != nil {
		return RemoteCommandEnvelope{}, err
	}
	protocol := command.DevicePayload()
	if len(protocol) == 0 {
		return RemoteCommandEnvelope{}, fmt.Errorf("command protocol is empty")
	}
	if err := p.publishCommand(ctx, command); err != nil {
		return RemoteCommandEnvelope{}, err
	}
	return command, nil
}

func (p *Publisher) publishCommand(ctx context.Context, command RemoteCommandEnvelope) error {
	if p.client == nil || !p.client.IsConnected() {
		return fmt.Errorf("mqtt command publisher is not connected")
	}

	payload, err := encodeCommandPayload(command)
	if err != nil {
		return fmt.Errorf("encode mqtt command payload: %w", err)
	}

	topic := fmt.Sprintf(p.config.TopicTemplate, command.Target)
	token := p.client.Publish(topic, commandQoS, false, payload)
	if !token.WaitTimeout(publishTimeout(ctx, 3*time.Second)) {
		return fmt.Errorf("publish mqtt command timeout")
	}
	if err := token.Error(); err != nil {
		return fmt.Errorf("publish mqtt command: %w", err)
	}

	p.log.Info("mqtt control command published",
		slog.String("robot_name", command.Target),
		slog.String("command", command.Command),
		slog.Any("protocol", []int(command.DevicePayload())),
		slog.Uint64("seq", command.Seq),
	)
	return nil
}

func encodeCommandPayload(command RemoteCommandEnvelope) ([]byte, error) {
	protocol := command.DevicePayload()
	if command.Command == "DOCK_EJECT" {
		payload := make([]byte, len(protocol))
		for i, value := range protocol {
			if value < 0 || value > 0xFF {
				return nil, fmt.Errorf("dock eject protocol byte out of range: %d", value)
			}
			payload[i] = byte(value)
		}
		return payload, nil
	}
	return json.Marshal(protocol)
}

// PublishRoute 发布一条已经编码好的路径点协议到 usv/{robotName}/web。
func (p *Publisher) PublishRoute(ctx context.Context, target string, payload string) error {
	target = strings.TrimSpace(target)
	if err := ValidateTarget(target); err != nil {
		return ValidationError{Err: err}
	}
	if strings.TrimSpace(payload) == "" {
		return ValidationError{Err: fmt.Errorf("route payload is required")}
	}
	if p.client == nil || !p.client.IsConnected() {
		return fmt.Errorf("mqtt command publisher is not connected")
	}
	if _, err := routeCommandCode(payload); err != nil {
		return ValidationError{Err: err}
	}

	topic := fmt.Sprintf(p.config.RouteTopicTemplate, target)
	token := p.client.Publish(topic, commandQoS, false, []byte(payload))
	if !token.WaitTimeout(publishTimeout(ctx, 3*time.Second)) {
		return fmt.Errorf("publish mqtt route timeout")
	}
	if err := token.Error(); err != nil {
		return fmt.Errorf("publish mqtt route: %w", err)
	}

	p.log.Info("mqtt route published",
		slog.String("robot_name", target),
		slog.Int("bytes", len(payload)),
		slog.String("protocol", payload),
	)
	return nil
}

func routeCommandCode(payload string) (int, error) {
	var values []json.Number
	if err := json.Unmarshal([]byte(payload), &values); err != nil || len(values) == 0 {
		return 0, fmt.Errorf("route payload must be a JSON array")
	}
	code, err := strconv.Atoi(values[0].String())
	if err != nil {
		return 0, fmt.Errorf("route payload command code must be an integer")
	}
	return code, nil
}

func publishTimeout(ctx context.Context, fallback time.Duration) time.Duration {
	deadline, ok := ctx.Deadline()
	if !ok {
		return fallback
	}
	remaining := time.Until(deadline)
	if remaining <= 0 {
		return time.Nanosecond
	}
	if remaining < fallback {
		return remaining
	}
	return fallback
}
