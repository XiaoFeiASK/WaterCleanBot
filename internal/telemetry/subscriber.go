// 文件作用：连接 MQTT Broker，订阅无人艇遥测 topic，并把最新位置写入数据库和内存缓存。

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
	BrokerURL string
	ClientID  string
	Topic     string
	Username  string
	Password  string
}

// Subscriber 负责把 MQTT 遥测消息接入现有定位链路。
// 调用方：cmd/watercleanbot/main.go 创建并启动它。
// 会调用：ParseUSVData、location.Repository.UpsertCurrentPosition、location.Store.Update。
type Subscriber struct {
	config     SubscriberConfig
	store      *location.Store
	repository *location.Repository
	log        *slog.Logger
	client     mqtt.Client
}

// NewSubscriber 创建 MQTT 遥测订阅器。
// 调用方：cmd/watercleanbot/main.go。
// 会调用：无，只组装依赖。
func NewSubscriber(config SubscriberConfig, store *location.Store, repository *location.Repository, log *slog.Logger) *Subscriber {
	return &Subscriber{
		config:     config,
		store:      store,
		repository: repository,
		log:        log,
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
	token := client.Subscribe(s.config.Topic, telemetryQoS, s.handleMessage)
	token.Wait()
	if err := token.Error(); err != nil {
		s.log.Error("subscribe mqtt telemetry topic failed", slog.String("topic", s.config.Topic), slog.Any("error", err))
		return
	}
	s.log.Info("mqtt telemetry topic subscribed", slog.String("topic", s.config.Topic))
}

// handleMessage 是 MQTT 消息进入后端定位链路的核心入口。
// 调用方：subscribe 注册给 MQTT client。
// 会调用：ParseUSVData -> Repository.UpsertCurrentPosition -> Store.Update。
func (s *Subscriber) handleMessage(_ mqtt.Client, message mqtt.Message) {
	data, err := ParseUSVData(message.Topic(), message.Payload())
	if err != nil {
		s.log.Warn("invalid usv telemetry ignored", slog.String("topic", message.Topic()), slog.Any("error", err))
		return
	}

	position := data.Position()
	updated, err := s.repository.UpsertCurrentPosition(context.Background(), position, data.Timestamp)
	if err != nil {
		s.log.Error("upsert robot location failed", slog.String("robot_name", position.RobotName), slog.Any("error", err))
		return
	}
	if !updated {
		s.log.Debug("stale robot telemetry ignored", slog.String("robot_name", position.RobotName), slog.Int64("timestamp", data.Timestamp))
		return
	}

	s.store.Update(position)
	s.log.Debug("robot telemetry applied", slog.String("robot_name", position.RobotName), slog.Int64("timestamp", data.Timestamp))
}
