// 文件作用：返回前端可播放的摄像头通道配置，不暴露原始 RTSP 账号密码。

package api

import (
	"net/http"
	"strings"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
)

// CameraStream 是前端监控页面需要的最小视频通道信息。
type CameraStream struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Placement string `json:"placement"`
	Status    string `json:"status"`
	Tone      string `json:"tone"`
	Type      string `json:"type"`
	PlayURL   string `json:"playUrl"`
}

// NewSharedCameraStreams 根据 HLS 入口生成所有船只共用的摄像头清单。
func NewSharedCameraStreams(hlsBaseURL string) []CameraStream {
	hlsURL := cameraHLSURLBuilder(hlsBaseURL)

	return []CameraStream{
		{
			ID:        "front",
			Name:      "前视主摄",
			Placement: "船艏广角",
			Status:    "HLS 可播放",
			Tone:      "teal",
			Type:      "hls",
			PlayURL:   hlsURL("front"),
		},
		{
			ID:        "rear",
			Name:      "后视泊靠",
			Placement: "船尾低位",
			Status:    "HLS 可播放",
			Tone:      "blue",
			Type:      "hls",
			PlayURL:   hlsURL("rear"),
		},
	}
}

// RobotCamerasHandler 返回所有船只共用的摄像头通道。
func RobotCamerasHandler(streams []CameraStream) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := strings.TrimSpace(r.PathValue("robotName"))
		if err := control.ValidateTarget(robotName); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid robot name"})
			return
		}

		writeJSON(w, http.StatusOK, streams)
	}
}

func cameraHLSURLBuilder(hlsBaseURL string) func(string) string {
	baseURL := strings.TrimRight(strings.TrimSpace(hlsBaseURL), "/")
	if baseURL == "" {
		baseURL = "/video"
	}

	return func(path string) string {
		path = strings.Trim(path, "/")
		return baseURL + "/" + path + "/index.m3u8"
	}
}
