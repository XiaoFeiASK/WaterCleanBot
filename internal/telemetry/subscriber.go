// 文件作用：连接 MQTT Broker，把无人艇遥测立即写入实时内存，并提交异步数据库快照。

package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	mqtt "github.com/eclipse/paho.mqtt.golang"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

const telemetryQoS byte = 1

// SubscriberConfig 是 MQTT 订阅器的运行配置。
// 调用方：cmd/watercleanbot/main.go 从 config.Config 组装它。
// 会调用：无，只保存配置值。
type SubscriberConfig struct {
	BrokerURL     string
	ClientID      string
	Topic         string
	FeedbackTopic string
	Username      string
	Password      string
}

// Subscriber 负责把 MQTT 遥测消息接入现有定位链路。
// 调用方：cmd/watercleanbot/main.go 创建并启动它。
// 会调用：ParseUSVData、location.Store.Update、location.SnapshotWriter.Submit。
type Subscriber struct {
	config SubscriberConfig
	store  *location.Store
	log    *slog.Logger
	client mqtt.Client
}

// NewSubscriber 创建 MQTT 遥测订阅器。
// 调用方：cmd/watercleanbot/main.go。
// 会调用：无，只组装依赖。
func NewSubscriber(config SubscriberConfig, store *location.Store, log *slog.Logger) *Subscriber {
	return &Subscriber{
		config: config,
		store:  store,
		log:    log,
	}
}

// Start 连接 MQTT Broker，并在连接成功或重连成功后订阅遥测 topic。
// 调用方：cmd/watercleanbot/main.go。
// 会调用：mqtt.NewClient、client.Connect，并通过 OnConnect 调用 subscribe。
func (s *Subscriber) Start(ctx context.Context) error {
	if s.config.BrokerURL == "" {
		return fmt.Errorf("mqtt broker url is required")
	}
	if s.config.ClientID == "" {
		s.config.ClientID = "watercleanbot-backend"
	}
	if s.config.Topic == "" {
		s.config.Topic = "usv/+/telemetry"
	}
	if s.config.FeedbackTopic == "" {
		s.config.FeedbackTopic = "usv/+/webfeedback"
	}

	options := mqtt.NewClientOptions()
	options.AddBroker(s.config.BrokerURL)
	options.SetClientID(s.config.ClientID)
	options.SetUsername(s.config.Username)
	options.SetPassword(s.config.Password)
	options.SetAutoReconnect(true)
	options.SetConnectTimeout(5 * time.Second)
	options.SetConnectionLostHandler(func(_ mqtt.Client, err error) {
		s.log.Warn("mqtt connection lost", slog.Any("error", err))
	})
	options.SetOnConnectHandler(func(client mqtt.Client) {
		s.subscribe(client)
	})

	s.client = mqtt.NewClient(options)
	token := s.client.Connect()
	token.Wait()
	if err := token.Error(); err != nil {
		return fmt.Errorf("connect mqtt broker: %w", err)
	}

	go func() {
		<-ctx.Done()
		s.client.Disconnect(250)
		s.log.Info("mqtt subscriber stopped")
	}()

	return nil
}

// subscribe 订阅 usv/+/telemetry，并指定每条消息由 handleMessage 处理。
// 调用方：Start 设置的 MQTT OnConnect 回调。
// 会调用：client.Subscribe。
func (s *Subscriber) subscribe(client mqtt.Client) {
	for topic, handler := range map[string]mqtt.MessageHandler{s.config.Topic: s.handleMessage, s.config.FeedbackTopic: s.handleFeedback} {
		token := client.Subscribe(topic, telemetryQoS, handler)
		token.Wait()
		if err := token.Error(); err != nil {
			s.log.Error("subscribe mqtt telemetry topic failed", slog.String("topic", topic), slog.Any("error", err))
			continue
		}
		s.log.Info("mqtt telemetry topic subscribed", slog.String("topic", topic))
	}
}

func (s *Subscriber) handleFeedback(_ mqtt.Client, message mqtt.Message) {
	if position, ok := ParseNavigationFeedback(message.Topic(), message.Payload()); ok {
		receivedAt := time.Now().UnixMilli()
		position.SourceTimestampMS = receivedAt
		position.ReceivedAtMS = receivedAt

		// 实时路径只写内存并广播，不等待 PostgreSQL。
		s.store.UpdateNavigation(position)
		return
	}
	if robotName, feedback, ok := ParseStatusFeedback(message.Topic(), message.Payload()); ok {
		s.store.UpdateFeedback(robotName, feedback)
		return
	}
	robotName, distanceMeters, ok := ParseDistanceFeedback(message.Topic(), message.Payload())
	if !ok {
		return
	}
	s.store.UpdateDistance(robotName, distanceMeters)
}

// handleMessage 是 MQTT 消息进入后端定位链路的核心入口。
// 调用方：subscribe 注册给 MQTT client。
// 会调用：ParseUSVData -> Store.Update -> SnapshotWriter.Submit。
func (s *Subscriber) handleMessage(_ mqtt.Client, message mqtt.Message) {
	data, err := ParseUSVData(message.Topic(), message.Payload())
	if err != nil {
		s.log.Warn("invalid usv telemetry ignored", slog.String("topic", message.Topic()), slog.Any("error", err))
		return
	}

	position := data.Position()
	position.SourceTimestampMS = data.Timestamp
	position.ReceivedAtMS = time.Now().UnixMilli()

	// 先立即更新实时内存；数据库持久化由 SnapshotWriter 在后台合并执行。
	_, updated := s.store.Update(position)
	if !updated {
		s.log.Debug("stale robot telemetry ignored", slog.String("robot_name", position.RobotName), slog.Int64("timestamp", data.Timestamp))
		return
	}
	s.log.Debug("robot telemetry applied", slog.String("robot_name", position.RobotName), slog.Int64("timestamp", data.Timestamp))
}
