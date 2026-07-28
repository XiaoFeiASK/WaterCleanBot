// 文件作用：只注册机器人实时定位查询接口。

package api

import (
	"log/slog"
	"net/http"

	"github.com/XiaoFeiASK/WaterCleanBot/internal/location"
)

// NewRouter 注册当前阶段唯一对外接口：查询机器人实时位置。
func NewRouter(store *location.Store, log *slog.Logger) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /api/robots/{robotCode}/location", RobotLocationHandler(store, log))
	return mux
}
