# 视频同源代理：首次接入与后续发布

## 原因与变更

浏览器访问 `localhost:8888` 指向浏览器所在电脑。现在后端默认返回 `/video/front/index.m3u8` 和 `/video/rear/index.m3u8`。
本地 Vite、生产 Nginx 分别转发到对应机器的 MediaMTX，并把 302 Location 保留在 `/video/` 前缀下。
不修改 RTSP 地址、不重建数据库、不重新下载镜像。显式的 CAMERA_HLS_BASE_URL 仍优先于默认值。

## 首次迁移：推送 main 前完成

修复分支不会触发 main 自动部署。当前站点为 `/etc/nginx/sites-enabled/watercleanbot`；保留现有 API、静态文件、TLS 和鉴权配置，不用仓库模板替换整个站点。

1. 在服务器备份环境及站点（以下命令以 root 执行）：

```bash
install -d -m 700 /var/backups/watercleanbot
BACKUP_DIR=$(mktemp -d /var/backups/watercleanbot/initial.XXXXXX)
cp -L /opt/watercleanbot/.env "$BACKUP_DIR/env"
cp -L /etc/nginx/sites-enabled/watercleanbot "$BACKUP_DIR/nginx-site"
chmod 600 "$BACKUP_DIR/env" "$BACKUP_DIR/nginx-site"
printf '备份目录：%s\n' "$BACKUP_DIR"
```

2. 编辑服务器 `/opt/watercleanbot/.env`，只把 `CAMERA_HLS_BASE_URL` 改成不带引号的 `/video`，保留其他参数；本地 `.env` 不能覆盖服务器配置。检查 systemd 的 Environment/EnvironmentFile 是否另行设置了此变量，若有也需同步修改。不要把含凭据的完整配置输出到聊天或 CI 日志。

3. 获取修复分支中的代理片段，不切换服务器工作区：

```bash
cd /opt/watercleanbot
git fetch gitea codex/fix-camera-video-proxy
install -d -m 755 /etc/nginx/snippets
```

如果 `/etc/nginx/snippets/watercleanbot-video.conf` 已存在，先备份到上面的备份目录。再执行：

```bash
git show FETCH_HEAD:deploy/nginx/video.conf > /etc/nginx/snippets/watercleanbot-video.conf
chmod 644 /etc/nginx/snippets/watercleanbot-video.conf
```

4. 在站点实际的 `server { ... }` 内、与现有 `location` 同级加入下面一行。已有等效 `/video/` location 时应先人工合并，不要重复定义：

```nginx
include /etc/nginx/snippets/watercleanbot-video.conf;
```

5. 检查并加载（失败则停止，恢复刚才的配置，不继续部署）：

```bash
nginx -t && systemctl reload nginx
```

6. 确认以上准备完成后，再将修复合并进 main 并推送两个仓库。新版 Gitea 工作流先提取新版部署脚本，由脚本在 reset 前备份 `.env`，reset 后恢复其内容、属主和权限；随后安装代理片段、检查 Nginx、构建并重启后端。不要手动先执行 `git reset --hard`，否则首次从已跟踪 `.env` 迁移时可能删除/覆盖服务器文件。

若 runner 不可用，在服务器提取新脚本再执行，而不是运行旧脚本：

```bash
cd /opt/watercleanbot
git fetch gitea main
UPDATE_SCRIPT=$(mktemp)
git show gitea/main:scripts/deploy-production.sh > "$UPDATE_SCRIPT"
bash "$UPDATE_SCRIPT"
```

仅在成功后删除该临时脚本。后续也可使用上述方式部署。部署依旧会 reset 仓库中的已跟踪文件；不要在服务器保留未提交的源码修改。

## 验收

- 浏览器 cameras 响应的 playUrl 必须以 `/video/` 开头，不能为 localhost；若仍是旧值，核对后端进程环境及是否已重启。
- 浏览器 m3u8 请求应到网站自身域名；302 Location 仍含 `/video/`，带原有 cookieCheck/session 参数。
- 播放列表、子列表和媒体分片均须成功，分别验证前后摄像头。仅主列表 200 不代表画面完整可播。
- 若子列表/分片正常但视频解码失败，再检查 HEVC 支持或切换摄像头 H.264。此补丁不转码。
- 不新增公网 8888 开放规则。代理片段本身不增加鉴权，视频入口需要与站点权限体系集成；已有的 Docker 端口暴露需单独审计。

## 回滚与秘密管理

- Nginx 片段安装在 `nginx -t` 失败时自动恢复旧片段，不 reload；首次站点 include 编辑由运维恢复备份后检查再 reload。
- 发布并非全事务：应用构建或健康检查失败时，须检查部署日志。保留服务器环境备份、上一版应用二进制/前端目录和发布提交号，再进行版本回退。
- 不要直接 reset 到仍跟踪 `.env` 的旧提交；先在仓库外备份 `.env`，更新代码后恢复它再启动后端。
- `.env` 停止跟踪不等于删除 Git 历史。历史中的真实凭据应轮换；本补丁不重写公共历史。
