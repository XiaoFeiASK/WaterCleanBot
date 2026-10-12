// 文件作用：提供设备历史轨迹的创建、查询、结束和删除接口。

package api

import (
	"context"
	"errors"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/control"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/tracks"
)

// TrackRepository 是轨迹 API 依赖的最小能力，便于 route/service 两种实现替换。
type TrackRepository interface {
	ListTracks(context.Context, string) ([]tracks.Track, error)
	CreateTrack(context.Context, string) (tracks.Track, error)
	EndTrack(context.Context, string, int64) (tracks.Track, error)
	ListPoints(context.Context, string, int64) ([]tracks.Point, bool, error)
	DeleteTrack(context.Context, string, int64) (bool, error)
}

// TrackStarter 可选地支持创建时把当前实时位置作为首点。
type TrackStarter interface {
	Create(context.Context, string, *tracks.PositionSample) (tracks.Track, error)
	End(context.Context, string, int64) (tracks.Track, error)
	Points(context.Context, string, int64) ([]tracks.Point, bool, error)
	Delete(context.Context, string, int64) error
}

func RobotTracksHandler(repository TrackRepository, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName, ok := validateTrackRobotName(w, r)
		if !ok {
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "track repository is unavailable"})
			return
		}
		list, err := repository.ListTracks(r.Context(), robotName)
		if err != nil {
			log.Warn("list robot tracks failed", slog.String("robot_name", robotName), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list tracks failed"})
			return
		}
		writeJSON(w, http.StatusOK, list)
	}
}

// CreateRobotTrackHandler 创建一条 recording 轨迹。service 实现还会把当前实时位置作为首点。
func CreateRobotTrackHandler(store *location.Store, repository TrackRepository, service TrackStarter, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName, ok := validateTrackRobotName(w, r)
		if !ok {
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "track repository is unavailable"})
			return
		}

		var initial *tracks.PositionSample
		if store != nil {
			if position, exists := store.Get(robotName); exists && position.Lat != nil && position.Lng != nil &&
				!math.IsNaN(*position.Lat) && !math.IsInf(*position.Lat, 0) && *position.Lat >= -90 && *position.Lat <= 90 &&
				!math.IsNaN(*position.Lng) && !math.IsInf(*position.Lng, 0) && *position.Lng >= -180 && *position.Lng <= 180 {
				receivedAtMS := position.ReceivedAtMS
				if receivedAtMS <= 0 {
					receivedAtMS = time.Now().UnixMilli()
				}
				initial = &tracks.PositionSample{Lat: *position.Lat, Lng: *position.Lng, ReceivedAt: time.UnixMilli(receivedAtMS)}
			}
		}

		var track tracks.Track
		var err error
		if service != nil {
			track, err = service.Create(r.Context(), robotName, initial)
		} else {
			track, err = repository.CreateTrack(r.Context(), robotName)
		}
		if errors.Is(err, tracks.ErrActiveTrack) {
			writeJSON(w, http.StatusConflict, map[string]string{"error": "robot already has an active track"})
			return
		}
		if err != nil {
			log.Warn("create robot track failed", slog.String("robot_name", robotName), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "create track failed"})
			return
		}
		writeJSON(w, http.StatusCreated, track)
	}
}

// EndRobotTrackHandler 结束指定进行中轨迹。
func EndRobotTrackHandler(repository TrackRepository, service TrackStarter, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName, trackID, ok := validateTrackTarget(w, r)
		if !ok {
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "track repository is unavailable"})
			return
		}

		var track tracks.Track
		var err error
		if service != nil {
			track, err = service.End(r.Context(), robotName, trackID)
		} else {
			track, err = repository.EndTrack(r.Context(), robotName, trackID)
		}
		switch {
		case errors.Is(err, tracks.ErrNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "track not found"})
		case errors.Is(err, tracks.ErrTrackNotEnded):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "track is not recording"})
		case err != nil:
			log.Warn("end robot track failed", slog.String("robot_name", robotName), slog.Int64("track_id", trackID), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "end track failed"})
		default:
			writeJSON(w, http.StatusOK, track)
		}
	}
}

// RobotTrackPointsHandler 按需返回一条完整轨迹点。
func RobotTrackPointsHandler(repository TrackRepository, service TrackStarter, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName, trackID, ok := validateTrackTarget(w, r)
		if !ok {
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "track repository is unavailable"})
			return
		}

		var points []tracks.Point
		var exists bool
		var err error
		if service != nil {
			points, exists, err = service.Points(r.Context(), robotName, trackID)
		} else {
			points, exists, err = repository.ListPoints(r.Context(), robotName, trackID)
		}
		if err != nil {
			log.Warn("list robot track points failed", slog.String("robot_name", robotName), slog.Int64("track_id", trackID), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "list track points failed"})
			return
		}
		if !exists {
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "track not found"})
			return
		}
		writeJSON(w, http.StatusOK, points)
	}
}

// DeleteRobotTrackHandler 删除已结束轨迹；进行中轨迹返回 409。
func DeleteRobotTrackHandler(repository TrackRepository, service TrackStarter, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		robotName, trackID, ok := validateTrackTarget(w, r)
		if !ok {
			return
		}
		if repository == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "track repository is unavailable"})
			return
		}

		var err error
		if service != nil {
			err = service.Delete(r.Context(), robotName, trackID)
		} else {
			var deleted bool
			deleted, err = repository.DeleteTrack(r.Context(), robotName, trackID)
			if err == nil && !deleted {
				err = tracks.ErrNotFound
			}
		}
		switch {
		case errors.Is(err, tracks.ErrNotFound):
			writeJSON(w, http.StatusNotFound, map[string]string{"error": "track not found"})
		case errors.Is(err, tracks.ErrTrackNotEnded):
			writeJSON(w, http.StatusConflict, map[string]string{"error": "recording track cannot be deleted"})
		case err != nil:
			log.Warn("delete robot track failed", slog.String("robot_name", robotName), slog.Int64("track_id", trackID), slog.Any("error", err))
			writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "delete track failed"})
		default:
			w.WriteHeader(http.StatusNoContent)
		}
	}
}

func validateTrackRobotName(w http.ResponseWriter, r *http.Request) (string, bool) {
	robotName := r.PathValue("robotName")
	if err := control.ValidateTarget(robotName); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid robot name"})
		return "", false
	}
	return robotName, true
}

func validateTrackTarget(w http.ResponseWriter, r *http.Request) (string, int64, bool) {
	robotName, ok := validateTrackRobotName(w, r)
	if !ok {
		return "", 0, false
	}
	trackID, err := strconv.ParseInt(r.PathValue("trackId"), 10, 64)
	if err != nil || trackID <= 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid track id"})
		return "", 0, false
	}
	return robotName, trackID, true
}
