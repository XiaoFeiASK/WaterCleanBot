// 文件作用：提供机器人位置 HTTP 查询与 SSE 实时推送接口。
package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

func RobotLocationHandler(store *location.Store, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		position, ok := store.Get(robotName)
		if !ok {
			log.Debug("robot location not found", slog.String("robot_name", robotName))
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "robot location not found"})
			return
		}
		writeJSON(w, http.StatusOK, position)
	}
}

func RobotLocationsHandler(store *location.Store) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, http.StatusOK, store.List())
	}
}

// RobotLocationStreamHandler 建立单向 SSE 流。snapshot 是连接时的全量状态，position 是后续增量。
func RobotLocationStreamHandler(store *location.Store, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		flusher, ok := w.(http.Flusher)
		if !ok {
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "streaming unsupported"})
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache, no-transform")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")

		snapshot, updates, cancel := store.SubscribeWithSnapshot()
		defer cancel()

		if err := writeSSE(w, "snapshot", snapshot); err != nil {
			return
		}
		flusher.Flush()

		heartbeat := time.NewTicker(15 * time.Second)
		defer heartbeat.Stop()
		for {
			select {
			case <-r.Context().Done():
				return
			case position, open := <-updates:
				if !open {
					return
				}
				if err := writeSSE(w, position.Type, position.Position); err != nil {
					log.Debug("location stream write failed", slog.Any("error", err))
					return
				}
				flusher.Flush()
			case <-heartbeat.C:
				if _, err := fmt.Fprint(w, ": heartbeat\n\n"); err != nil {
					return
				}
				flusher.Flush()
			}
		}
	}
}

func CreateRobotHandler(store *location.Store, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var request struct {
			RobotName string `json:"robotName"`
		}
		decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(&request); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid robot name"})
			return
		}
		if decoder.Decode(&struct{}{}) != io.EOF {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid payload"})
			return
		}
		request.RobotName = strings.TrimSpace(request.RobotName)
		if !location.ValidRobotName(request.RobotName) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid robot name"})
			return
		}
		err := store.Create(r.Context(), request.RobotName)
		if errors.Is(err, location.ErrRobotExists) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "robot already exists"})
			return
		}
		if err != nil {
			log.Warn("persist robot creation failed", slog.Any("error", err))
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "persistence pending", "cacheChanged": true})
			return
		}
		writeJSON(w, http.StatusCreated, map[string]string{"robotName": request.RobotName})
	}
}

func DeleteRobotHandler(store *location.Store, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName := r.PathValue("robotName")
		if !location.ValidRobotName(robotName) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid robot name"})
			return
		}
		if err := store.Delete(r.Context(), robotName); err != nil {
			log.Warn("persist robot deletion failed", slog.Any("error", err))
			writeJSON(w, http.StatusServiceUnavailable, map[string]any{"error": "persistence pending", "cacheChanged": true})
			return
		}
		w.WriteHeader(http.StatusNoContent)
	}
}

func writeSSE(w http.ResponseWriter, event string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event, data)
	return err
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}
