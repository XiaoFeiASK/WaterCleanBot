// 文件作用：定义历史轨迹、轨迹点和轨迹管理错误。

package tracks

import (
	"errors"
	"time"
)

const (
	StatusRecording = "recording"
	StatusEnded     = "ended"
)

var (
	ErrNotFound        = errors.New("track not found")
	ErrActiveTrack     = errors.New("robot already has an active track")
	ErrTrackNotEnded   = errors.New("track is still recording")
	ErrInvalidPosition = errors.New("invalid track position")
)

// Track 是设备的单次历史轨迹。
type Track struct {
	ID         int64      `json:"id"`
	RobotName  string     `json:"robotName,omitempty"`
	TrackNo    int64      `json:"trackNo"`
	Name       string     `json:"name"`
	Status     string     `json:"status"`
	StartedAt  time.Time  `json:"startedAt"`
	EndedAt    *time.Time `json:"endedAt"`
	PointCount int64      `json:"pointCount"`
}

// Point 是轨迹中的一个 WGS-84 采样点。
type Point struct {
	Seq        int64     `json:"seq"`
	Lng        float64   `json:"lng"`
	Lat        float64   `json:"lat"`
	ReceivedAt time.Time `json:"receivedAt"`
}

// ActiveTrack 是轨迹采样器需要的进行中轨迹状态。
type ActiveTrack struct {
	ID             int64
	RobotName      string
	TrackNo        int64
	LastLat        *float64
	LastLng        *float64
	LastReceivedAt time.Time
	NextPointSeq   int64
}
