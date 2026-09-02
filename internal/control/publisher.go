// 文件作用：连接 MQTT Broker，把后端校验后的遥控指令发布到对应无人艇 topic。

package control

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"sync"
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
	Username              string
	Password              string
	HeartbeatStateChanged func(HeartbeatState)
}

// HeartbeatState 是设备心跳健康状态；仅在状态变化或收到回执时通知观察者。
type HeartbeatState struct {
	RobotName string
	Online    bool
	LastAckAt time.Time
	Misses    int
}

// Publisher 负责把遥控指令和航线协议发布到 usv/{robotName}/web。
type Publisher struct {
	config          PublisherConfig
	log             *slog.Logger
	client          mqtt.Client
	seq             atomic.Uint64
	receiptMu       sync.Mutex
	pendingReceipts map[string][]chan Receipt
	heartbeatMu     sync.Mutex
	heartbeats      map[string]heartbeatTracker
}

type heartbeatTracker struct {
	lastAck time.Time
	misses  int
	online  bool
}

const (
	heartbeatOfflineAfter  = 2 * time.Second
	heartbeatMissThreshold = 3
)

// Receipt 是艇端系统状态报文确认的最小信息。
type Receipt struct {
	Topic      string    `json:"topic"`
	ReturnCode int       `json:"returnCode"`
	Payload    []int     `json:"payload"`
	ReceivedAt time.Time `json:"receivedAt"`
}

// ReceiptTimeoutError 表示 MQTT 已发布但在请求上下文结束前没有收到匹配回执。
type ReceiptTimeoutError struct {
	Target string
	Code   int
}

func (e ReceiptTimeoutError) Error() string {
	return fmt.Sprintf("mqtt receipt timeout for %s command %d", e.Target, e.Code)
}

func IsReceiptTimeout(err error) bool {
	_, ok := err.(ReceiptTimeoutError)
	return ok
}

// NewPublisher 创建 MQTT 指令发布器。
func NewPublisher(config PublisherConfig, log *slog.Logger) *Publisher {
	return &Publisher{
		config:          config,
		log:             log,
		pendingReceipts: make(map[string][]chan Receipt),
		heartbeats:      make(map[string]heartbeatTracker),
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
		p.config.TopicTemplate = "usv/%s/web"
	}
	if !strings.Contains(p.config.TopicTemplate, "%s") {
		return fmt.Errorf("mqtt command topic template must contain %%s")
	}
	if p.config.RouteTopicTemplate == "" {
		p.config.RouteTopicTemplate = "usv/%s/web"
	}
	if !strings.Contains(p.config.RouteTopicTemplate, "%s") {
		return fmt.Errorf("mqtt route topic template must contain %%s")
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
		p.subscribeReceipts(client)
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
	receiptCh := p.registerReceipt(target, protocol[0])
	if err := p.publishCommand(ctx, command); err != nil {
		p.unregisterReceipt(target, protocol[0], receiptCh)
		return RemoteCommandEnvelope{}, err
	}
	receipt, err := p.waitReceipt(ctx, target, protocol[0], receiptCh)
	if err != nil {
		return command, err
	}
	command.Receipt = &receipt
	return command, nil
}

// StartHeartbeat 以 2Hz 向当前已知设备发布 [17]。
func (p *Publisher) StartHeartbeat(ctx context.Context, targets func() []string) {
	if targets == nil {
		return
	}

	ticker := time.NewTicker(HeartbeatInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			p.log.Info("mqtt command heartbeat stopped")
			return
		case <-ticker.C:
			for _, target := range targets() {
				p.markHeartbeatSent(target)
				command, err := BuildRemoteCommand(target, p.seq.Add(1), RemoteCommandRequest{Command: "HEARTBEAT"})
				if err != nil {
					p.log.Warn("build mqtt heartbeat failed", slog.String("robot_name", target), slog.Any("error", err))
					continue
				}
				if err := p.publishCommand(ctx, command); err != nil {
					p.log.Warn("publish mqtt heartbeat failed", slog.String("robot_name", target), slog.Any("error", err))
				}
			}
		}
	}
}

func (p *Publisher) publishCommand(ctx context.Context, command RemoteCommandEnvelope) error {
	if p.client == nil || !p.client.IsConnected() {
		return fmt.Errorf("mqtt command publisher is not connected")
	}

	payload, err := json.Marshal(command.DevicePayload())
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

// PublishRoute 发布一条已经编码好的路径点协议到 usv/{robotName}/web。
func (p *Publisher) PublishRoute(ctx context.Context, target string, payload string) (Receipt, error) {
	target = strings.TrimSpace(target)
	if err := ValidateTarget(target); err != nil {
		return Receipt{}, ValidationError{Err: err}
	}
	if strings.TrimSpace(payload) == "" {
		return Receipt{}, ValidationError{Err: fmt.Errorf("route payload is required")}
	}
	if p.client == nil || !p.client.IsConnected() {
		return Receipt{}, fmt.Errorf("mqtt command publisher is not connected")
	}
	code, err := routeCommandCode(payload)
	if err != nil {
		return Receipt{}, ValidationError{Err: err}
	}
	receiptCh := p.registerReceipt(target, code)

	topic := fmt.Sprintf(p.config.RouteTopicTemplate, target)
	token := p.client.Publish(topic, commandQoS, false, []byte(payload))
	if !token.WaitTimeout(publishTimeout(ctx, 3*time.Second)) {
		p.unregisterReceipt(target, code, receiptCh)
		return Receipt{}, fmt.Errorf("publish mqtt route timeout")
	}
	if err := token.Error(); err != nil {
		p.unregisterReceipt(target, code, receiptCh)
		return Receipt{}, fmt.Errorf("publish mqtt route: %w", err)
	}

	p.log.Info("mqtt route published",
		slog.String("robot_name", target),
		slog.Int("bytes", len(payload)),
		slog.String("protocol", payload),
	)
	receipt, err := p.waitReceipt(ctx, target, code, receiptCh)
	if err != nil {
		return Receipt{}, err
	}
	return receipt, nil
}

func (p *Publisher) subscribeReceipts(client mqtt.Client) {
	topics := []string{strings.Replace(p.config.TopicTemplate, "%s", "+", 1)}
	routeTopic := strings.Replace(p.config.RouteTopicTemplate, "%s", "+", 1)
	if routeTopic != topics[0] {
		topics = append(topics, routeTopic)
	}
	for _, topic := range topics {
		token := client.Subscribe(topic, commandQoS, p.handleReceipt)
		token.Wait()
		if err := token.Error(); err != nil {
			p.log.Error("subscribe mqtt receipt topic failed", slog.String("topic", topic), slog.Any("error", err))
			continue
		}
		p.log.Info("mqtt receipt topic subscribed", slog.String("topic", topic))
	}
}

func (p *Publisher) handleReceipt(_ mqtt.Client, message mqtt.Message) {
	receipt, ok := parseReceipt(message.Topic(), message.Payload())
	if !ok {
		return
	}
	if receipt.ReturnCode == parameterlessCommands["HEARTBEAT"] {
		p.markHeartbeatAck(receipt.TopicTarget())
	}
	key := receiptKey(receipt.TopicTarget(), receipt.ReturnCode)
	p.receiptMu.Lock()
	waiters := p.pendingReceipts[key]
	var waiter chan Receipt
	if len(waiters) > 0 {
		waiter = waiters[0]
		waiters = waiters[1:]
		if len(waiters) == 0 {
			delete(p.pendingReceipts, key)
		} else {
			p.pendingReceipts[key] = waiters
		}
	}
	p.receiptMu.Unlock()
	if waiter != nil {
		select {
		case waiter <- receipt:
		default:
		}
	}
	p.log.Debug("mqtt command receipt received", slog.String("topic", receipt.Topic), slog.Int("return_code", receipt.ReturnCode))
}

func (p *Publisher) markHeartbeatSent(target string) {
	p.heartbeatMu.Lock()
	state := p.heartbeats[target]
	wasOffline := state.misses >= heartbeatMissThreshold
	if state.lastAck.IsZero() || time.Since(state.lastAck) > heartbeatOfflineAfter {
		state.misses++
	}
	previousOnline := state.online
	state.online = !state.lastAck.IsZero() && time.Since(state.lastAck) <= heartbeatOfflineAfter && state.misses < heartbeatMissThreshold
	p.heartbeats[target] = state
	p.heartbeatMu.Unlock()
	if state.online != previousOnline || (!wasOffline && state.misses >= heartbeatMissThreshold) {
		p.notifyHeartbeatState(target, state)
	}
}

func (p *Publisher) markHeartbeatAck(target string) {
	p.heartbeatMu.Lock()
	state := p.heartbeats[target]
	state.lastAck = time.Now()
	state.misses = 0
	state.online = true
	p.heartbeats[target] = state
	p.heartbeatMu.Unlock()
	// 每次回执都更新最后确认时间；观察者只更新健康数据，不产生前端提示。
	p.notifyHeartbeatState(target, state)
}

func (p *Publisher) notifyHeartbeatState(target string, state heartbeatTracker) {
	if p.config.HeartbeatStateChanged == nil {
		return
	}
	p.config.HeartbeatStateChanged(HeartbeatState{RobotName: target, Online: state.online, LastAckAt: state.lastAck, Misses: state.misses})
}

func (p *Publisher) registerReceipt(target string, code int) chan Receipt {
	ch := make(chan Receipt, 1)
	p.receiptMu.Lock()
	key := receiptKey(target, code)
	p.pendingReceipts[key] = append(p.pendingReceipts[key], ch)
	p.receiptMu.Unlock()
	return ch
}

func (p *Publisher) unregisterReceipt(target string, code int, ch chan Receipt) {
	p.receiptMu.Lock()
	defer p.receiptMu.Unlock()
	key := receiptKey(target, code)
	waiters := p.pendingReceipts[key]
	for index, waiter := range waiters {
		if waiter == ch {
			waiters = append(waiters[:index], waiters[index+1:]...)
			break
		}
	}
	if len(waiters) == 0 {
		delete(p.pendingReceipts, key)
	} else {
		p.pendingReceipts[key] = waiters
	}
}

func (p *Publisher) waitReceipt(ctx context.Context, target string, code int, ch chan Receipt) (Receipt, error) {
	defer p.unregisterReceipt(target, code, ch)
	select {
	case receipt := <-ch:
		return receipt, nil
	case <-ctx.Done():
		return Receipt{}, ReceiptTimeoutError{Target: target, Code: code}
	}
}

func receiptKey(target string, code int) string {
	return target + "\x00" + strconv.Itoa(code)
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

func parseReceipt(topic string, payload []byte) (Receipt, bool) {
	parts := strings.Split(topic, "/")
	if len(parts) != 3 || parts[0] != "usv" || parts[1] == "" || parts[2] != "web" {
		return Receipt{}, false
	}
	var values []int
	if err := json.Unmarshal(payload, &values); err != nil || len(values) < 3 || values[0] != 17 {
		return Receipt{}, false
	}
	return Receipt{Topic: topic, ReturnCode: values[2], Payload: values, ReceivedAt: time.Now()}, true
}

func (r Receipt) TopicTarget() string {
	parts := strings.Split(r.Topic, "/")
	if len(parts) == 3 {
		return parts[1]
	}
	return ""
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
