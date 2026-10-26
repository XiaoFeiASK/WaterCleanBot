package api

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
	"github.com/XiaoFeiASK/WaterCleanBot/internal/shoreline"
)

type ShorelineRepository interface {
	Get(context.Context) (*shoreline.Dataset, error)
	Replace(context.Context, *string, shoreline.Files, shoreline.Uploader) (*shoreline.Dataset, error)
	Update(context.Context, *string, shoreline.Files, shoreline.Uploader) (*shoreline.Dataset, error)
	Delete(context.Context, *string) error
}

type shorelineAuthenticator interface {
	Authenticate(context.Context, string) (auth.User, auth.Session, error)
}

func ShorelineHandler(repository ShorelineRepository, authenticator shorelineAuthenticator, log *slog.Logger) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-store")
		cookie, err := r.Cookie(sessionCookieName)
		if err != nil || authenticator == nil {
			authError(w, 401, "unauthenticated", "请先登录", nil)
			return
		}
		user, _, err := authenticator.Authenticate(r.Context(), cookie.Value)
		if err != nil {
			authError(w, 401, "unauthenticated", "登录状态已失效，请重新登录", nil)
			return
		}
		if repository == nil {
			authError(w, 503, "unavailable", "岸线服务暂不可用", nil)
			return
		}
		var dataset *shoreline.Dataset
		switch r.Method {
		case http.MethodGet:
			dataset, err = repository.Get(r.Context())
		case http.MethodPut, http.MethodPatch, http.MethodDelete:
			var request struct {
				ExpectedRevision *string         `json:"expectedRevision"`
				Files            shoreline.Files `json:"files"`
			}
			decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, shoreline.MaxRequestBytes))
			decoder.DisallowUnknownFields()
			err = decoder.Decode(&request)
			if err == nil {
				if trailing := decoder.Decode(&struct{}{}); trailing != io.EOF {
					err = trailing
					if err == nil {
						err = errors.New("multiple JSON values")
					}
				}
			}
			if err != nil {
				var tooLarge *http.MaxBytesError
				if errors.As(err, &tooLarge) {
					authError(w, 413, "too_large", "上传数据不能超过 20 MiB", nil)
				} else {
					authError(w, 400, "invalid_request", "JSON 请求格式错误", nil)
				}
				return
			}
			if r.Method == http.MethodDelete {
				if request.ExpectedRevision == nil || *request.ExpectedRevision == "" {
					authError(w, 400, "invalid_request", "删除时必须提供当前版本", nil)
					return
				}
				err = repository.Delete(r.Context(), request.ExpectedRevision)
			} else {
				var files shoreline.Files
				files, err = shoreline.ValidateFiles(request.Files)
				if err == nil {
					uploader := shoreline.Uploader{ID: user.ID, DisplayName: user.DisplayName}
					if r.Method == http.MethodPatch {
						dataset, err = repository.Update(r.Context(), request.ExpectedRevision, files, uploader)
					} else {
						dataset, err = repository.Replace(r.Context(), request.ExpectedRevision, files, uploader)
					}
				}
			}
		default:
			w.Header().Set("Allow", "GET, PUT, PATCH, DELETE")
			w.WriteHeader(http.StatusMethodNotAllowed)
			return
		}
		if err != nil {
			var validation *shoreline.ValidationError
			switch {
			case errors.Is(err, shoreline.ErrConflict):
				authError(w, 409, "revision_conflict", "公共岸线已被其他人更新，请重新加载后确认", nil)
			case errors.As(err, &validation):
				authError(w, 400, "invalid_files", validation.Message, nil)
			default:
				log.Error("shoreline request failed", slog.String("method", r.Method), slog.Any("error", err))
				authError(w, 503, "unavailable", "岸线服务异常，原数据未被替换，请稍后重试", nil)
			}
			return
		}
		writeJSON(w, 200, struct {
			Dataset *shoreline.Dataset `json:"dataset"`
		}{dataset})
	}
}
