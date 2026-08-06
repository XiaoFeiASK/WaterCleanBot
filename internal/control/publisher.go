// 文件作用：连接 MQTT Broker，把后端校验后的遥控指令发布到对应无人艇 topic。

package control

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	"sync/atomic"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"
)

const commandQoS byte = 1

// PublisherConfig 是 MQTT 指令发布器的运行配置。
type PublisherConfig struct {
	BrokerURL     string
	ClientID      string
	TopicTemplate string
	Username      string
	Password      string
}

// Publisher 负责把遥控指令发布到 usv/{robotName}/command。
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
		p.config.TopicTemplate = "usv/%s/command"
	}
	if !strings.Contains(p.config.TopicTemplate, "%s") {
		return fmt.Errorf("mqtt command topic template must contain %%s")
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
	options.SetOnConnectHandler(func(_ mqtt.Client) {
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
	if p.client == nil || !p.client.IsConnected() {
		return RemoteCommandEnvelope{}, fmt.Errorf("mqtt command publisher is not connected")
	}

	payload, err := json.Marshal(command.DevicePayload())
	if err != nil {
		return RemoteCommandEnvelope{}, fmt.Errorf("encode mqtt command payload: %w", err)
	}

	topic := fmt.Sprintf(p.config.TopicTemplate, command.Target)
	token := p.client.Publish(topic, commandQoS, false, payload)
	if !token.WaitTimeout(publishTimeout(ctx, 3*time.Second)) {
		return RemoteCommandEnvelope{}, fmt.Errorf("publish mqtt command timeout")
	}
	if err := token.Error(); err != nil {
		return RemoteCommandEnvelope{}, fmt.Errorf("publish mqtt command: %w", err)
	}

	p.log.Info("mqtt control command published",
		slog.String("robot_name", command.Target),
		slog.String("command", command.Command),
		slog.Uint64("seq", command.Seq),
	)
	return command, nil
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
