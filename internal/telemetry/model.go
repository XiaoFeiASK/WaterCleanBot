// 文件作用：定义 MQTT 遥测报文模型，并把无人艇上报数据转换成后端当前位置模型。

package telemetry

import (
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"regexp"
	"strings"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

var nonFiniteJSONNumberPattern = regexp.MustCompile(`(?i)(:\s*)(nan|inf|-inf|infinity|-infinity)(\s*[,}])`)

func ParseDistanceFeedback(topic string, payload []byte) (string, float64, bool) {
	parts := strings.Split(topic, "/")
	if len(parts) != 3 || parts[0] != "usv" || parts[1] == "" || parts[2] != "webfeedback" {
		return "", 0, false
	}
	var values []json.Number
	if err := json.Unmarshal(payload, &values); err != nil || len(values) <= 11 || values[0].String() != "19" {
		return "", 0, false
	}
	distance, err := values[11].Float64()
	if err != nil || !isFiniteNumber(distance) || distance < 0 { return "", 0, false }
	return parts[1], distance, true
}

// USVData 对应无人艇发布到 usv/{usvId}/telemetry 的 JSON 报文。
// 调用方：Subscriber.handleMessage 在收到 MQTT 消息后解析它。
// 会调用：Position 将合法报文转换成 HTTP 接口已有的 location.Position。
type USVData struct {
	USVID     string  `json:"usvId"`
	Lat       float64 `json:"lat"`
	Lng       float64 `json:"lng"`
	Heading   float64 `json:"heading"`
	Speed     float64 `json:"speed"`
	Battery   float64 `json:"battery"`
	Status    int     `json:"status"`
	Timestamp int64   `json:"timestamp"`
}

// ParseUSVData 解析并校验一条 MQTT 遥测消息。
// 调用方：Subscriber.handleMessage。
// 会调用：topicUSVID、sanitizeTelemetryPayload、json.Unmarshal、USVData.Validate。
func ParseUSVData(topic string, payload []byte) (USVData, error) {
	topicID, err := topicUSVID(topic)
	if err != nil {
		return USVData{}, err
	}

	var data USVData
	if err := json.Unmarshal(sanitizeTelemetryPayload(payload), &data); err != nil {
		return USVData{}, fmt.Errorf("decode usv telemetry payload: %w", err)
	}
	data.USVID = strings.TrimSpace(data.USVID)
	if data.Timestamp <= 0 {
		// 兼容艇端未上报 timestamp 的旧报文，使用后端接收时间参与新旧数据比较。
		data.Timestamp = time.Now().UnixMilli()
	}
	if err := data.Validate(topicID); err != nil {
		return USVData{}, err
	}
	return data, nil
}

func sanitizeTelemetryPayload(payload []byte) []byte {
	// 设备端当前会上报 battery:nan。nan 不是合法 JSON 数字，先转成 null；
	// 对 float64 字段来说 null 会解成 0，保证 HTTP JSON 响应仍是可编码的有限数值。
	return []byte(nonFiniteJSONNumberPattern.ReplaceAllString(string(payload), `${1}null${3}`))
}

// Validate 校验字段范围，避免非法遥测数据进入数据库和内存缓存。
// 调用方：ParseUSVData。
// 会调用：isFiniteNumber。
func (d USVData) Validate(topicUSVID string) error {
	if d.USVID == "" {
		return errors.New("usvId is required")
	}
	if topicUSVID != d.USVID {
		return fmt.Errorf("topic usvId %q does not match payload usvId %q", topicUSVID, d.USVID)
	}
	if !isFiniteNumber(d.Lat) || d.Lat < -90 || d.Lat > 90 {
		return fmt.Errorf("lat out of range: %v", d.Lat)
	}
	if !isFiniteNumber(d.Lng) || d.Lng < -180 || d.Lng > 180 {
		return fmt.Errorf("lng out of range: %v", d.Lng)
	}
	if !isFiniteNumber(d.Heading) || d.Heading < 0 || d.Heading > 360 {
		return fmt.Errorf("heading out of range: %v", d.Heading)
	}
	if !isFiniteNumber(d.Speed) || d.Speed < 0 {
		return fmt.Errorf("speed out of range: %v", d.Speed)
	}
	if !isFiniteNumber(d.Battery) || d.Battery < 0 || d.Battery > 100 {
		return fmt.Errorf("battery out of range: %v", d.Battery)
	}
	if d.Status < 0 {
		return fmt.Errorf("status out of range: %v", d.Status)
	}
	if d.Timestamp <= 0 {
		return fmt.Errorf("timestamp is required: %v", d.Timestamp)
	}
	return nil
}

// Position 把 MQTT 遥测报文转换成当前 HTTP 接口使用的位置模型。
// 调用方：Subscriber.handleMessage。
// 会调用：无，只做字段映射；当前直接用 usvId 作为 RobotName。
func (d USVData) Position() location.Position {
	return location.Position{
		RobotName: d.USVID,
		Lat:       d.Lat,
		Lng:       d.Lng,
		Heading:   d.Heading,
		Speed:     d.Speed,
		Battery:   d.Battery,
		Status:    d.Status,
	}
}

func topicUSVID(topic string) (string, error) {
	parts := strings.Split(topic, "/")
	if len(parts) != 3 || parts[0] != "usv" || parts[2] != "telemetry" || parts[1] == "" {
		return "", fmt.Errorf("invalid telemetry topic: %s", topic)
	}
	return parts[1], nil
}

func isFiniteNumber(value float64) bool {
	return !math.IsNaN(value) && !math.IsInf(value, 0)
}
