package api

import (
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/auth"
)

const sessionCookieName = "watercleanbot_session"

type AuthHandler struct {
	service *auth.Service
	log     *slog.Logger
}

func NewAuthHandler(service *auth.Service, log *slog.Logger) *AuthHandler {
	return &AuthHandler{service: service, log: log}
}

type errorBody struct {
	Error apiError `json:"error"`
}
type apiError struct {
	Code    string            `json:"code"`
	Message string            `json:"message"`
	Fields  map[string]string `json:"fields,omitempty"`
}

func authError(w http.ResponseWriter, status int, code, message string, fields map[string]string) {
	writeJSON(w, status, errorBody{apiError{Code: code, Message: message, Fields: fields}})
}
func decodeBody(w http.ResponseWriter, r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, 64<<10))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	if err := dec.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return errors.New("multiple json values")
	}
	return nil
}

func (h *AuthHandler) Config(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, auth.PublicConfig{RegistrationEnabled: h.service.Config().RegistrationEnabled})
}

type registerRequest struct {
	Username    string `json:"username"`
	DisplayName string `json:"displayName"`
	Email       string `json:"email"`
	Password    string `json:"password"`
	RememberMe  bool   `json:"rememberMe"`
}
type loginRequest struct {
	Login      string `json:"login"`
	Password   string `json:"password"`
	RememberMe bool   `json:"rememberMe"`
}
type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword"`
	NewPassword     string `json:"newPassword"`
}
type profileRequest struct {
	DisplayName string `json:"displayName"`
}
type userResponse struct {
	User auth.User `json:"user"`
}

func (h *AuthHandler) Register(w http.ResponseWriter, r *http.Request) {
	var req registerRequest
	if decodeBody(w, r, &req) != nil {
		authError(w, 400, "invalid_request", "注册信息格式错误", nil)
		return
	}
	u, token, err := h.service.Register(r.Context(), req.Username, req.DisplayName, req.Email, req.Password, h.clientIP(r), r.UserAgent(), req.RememberMe)
	if err != nil {
		h.handleError(w, err)
		return
	}
	h.setCookie(w, token, req.RememberMe)
	writeJSON(w, http.StatusCreated, userResponse{u})
}
func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if decodeBody(w, r, &req) != nil {
		authError(w, 400, "invalid_request", "登录信息格式错误", nil)
		return
	}
	u, token, err := h.service.Login(r.Context(), req.Login, req.Password, h.clientIP(r), r.UserAgent(), req.RememberMe)
	if err != nil {
		h.handleError(w, err)
		return
	}
	h.setCookie(w, token, req.RememberMe)
	writeJSON(w, http.StatusOK, userResponse{u})
}
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	u, _, ok := h.current(w, r)
	if !ok {
		return
	}
	writeJSON(w, http.StatusOK, userResponse{u})
}
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	cookie, _ := r.Cookie(sessionCookieName)
	if cookie != nil {
		_ = h.service.Logout(r.Context(), cookie.Value)
	}
	h.clearCookie(w)
	w.WriteHeader(http.StatusNoContent)
}
func (h *AuthHandler) ChangePassword(w http.ResponseWriter, r *http.Request) {
	u, sess, ok := h.current(w, r)
	if !ok {
		return
	}
	var req changePasswordRequest
	if decodeBody(w, r, &req) != nil {
		authError(w, 400, "invalid_request", "密码信息格式错误", nil)
		return
	}
	token, err := h.service.ChangePassword(r.Context(), u, sess, req.CurrentPassword, req.NewPassword, h.clientIP(r), r.UserAgent())
	if err != nil {
		h.handleError(w, err)
		return
	}
	h.setCookie(w, token, sess.RememberMe)
	writeJSON(w, http.StatusOK, map[string]string{"status": "password_changed"})
}
func (h *AuthHandler) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	u, _, ok := h.current(w, r)
	if !ok {
		return
	}
	var req profileRequest
	if decodeBody(w, r, &req) != nil {
		authError(w, 400, "invalid_request", "个人资料格式错误", nil)
		return
	}
	u, err := h.service.UpdateProfile(r.Context(), u, req.DisplayName)
	if err != nil {
		h.handleError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, userResponse{u})
}
func (h *AuthHandler) current(w http.ResponseWriter, r *http.Request) (auth.User, auth.Session, bool) {
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil {
		authError(w, 401, "unauthenticated", "请先登录", nil)
		return auth.User{}, auth.Session{}, false
	}
	u, s, err := h.service.Authenticate(r.Context(), cookie.Value)
	if err != nil {
		h.clearCookie(w)
		authError(w, 401, "unauthenticated", "登录状态已失效，请重新登录", nil)
		return auth.User{}, auth.Session{}, false
	}
	return u, s, true
}
func (h *AuthHandler) handleError(w http.ResponseWriter, err error) {
	var validation *auth.ValidationError
	switch {
	case errors.As(err, &validation):
		authError(w, 400, "validation_failed", "请检查填写内容", validation.Fields)
	case errors.Is(err, auth.ErrUsernameExists):
		authError(w, 409, "username_exists", "该用户名已被注册", map[string]string{"username": "该用户名已被注册"})
	case errors.Is(err, auth.ErrEmailExists):
		authError(w, 409, "email_exists", "该邮箱已被注册", map[string]string{"email": "该邮箱已被注册"})
	case errors.Is(err, auth.ErrInvalidCredentials):
		authError(w, 401, "invalid_credentials", "用户名、邮箱或密码错误", nil)
	case errors.Is(err, auth.ErrDisabled):
		authError(w, 403, "account_disabled", "账号已被禁用", nil)
	case errors.Is(err, auth.ErrRegistrationDisabled):
		authError(w, 403, "registration_disabled", "当前未开放注册", nil)
	case errors.Is(err, auth.ErrRateLimited):
		authError(w, 429, "rate_limited", "请求过于频繁，请稍后再试", nil)
	default:
		h.log.Error("authentication request failed", slog.Any("error", err))
		authError(w, 500, "internal_error", "服务暂时不可用，请稍后再试", nil)
	}
}
func (h *AuthHandler) setCookie(w http.ResponseWriter, token string, remember bool) {
	c := &http.Cookie{Name: sessionCookieName, Value: token, Path: "/", HttpOnly: true, Secure: h.service.Config().CookieSecure, SameSite: http.SameSiteLaxMode}
	if remember {
		c.MaxAge = int(h.service.Config().RememberDuration.Seconds())
		c.Expires = time.Now().Add(h.service.Config().RememberDuration)
	}
	http.SetCookie(w, c)
}
func (h *AuthHandler) clearCookie(w http.ResponseWriter) {
	http.SetCookie(w, &http.Cookie{Name: sessionCookieName, Value: "", Path: "/", HttpOnly: true, Secure: h.service.Config().CookieSecure, SameSite: http.SameSiteLaxMode, MaxAge: -1, Expires: time.Unix(1, 0)})
}
func (h *AuthHandler) clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	trusted := false
	for _, v := range h.service.Config().TrustedProxies {
		if host == v {
			trusted = true
			break
		}
	}
	if trusted {
		if first, _, ok := strings.Cut(r.Header.Get("X-Forwarded-For"), ","); ok || first != "" {
			if ip := net.ParseIP(strings.TrimSpace(first)); ip != nil {
				return ip.String()
			}
		}
	}
	return host
}
