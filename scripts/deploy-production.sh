#!/usr/bin/env bash
set -Eeuo pipefail

APP_DIR="${APP_DIR:-/opt/watercleanbot}"
DEPLOY_REMOTE="${DEPLOY_REMOTE:-gitea}"
DEPLOY_BRANCH="${DEPLOY_BRANCH:-main}"
RUN_GIT_UPDATE=1

if [[ "${1:-}" == "--no-git" ]]; then
  RUN_GIT_UPDATE=0
fi

# Serialize automated and manual deployments on the server.
exec 9>/run/lock/watercleanbot-deploy.lock
flock -n 9 || { echo "Another deployment is running." >&2; exit 1; }

cd "$APP_DIR"

if [[ "$RUN_GIT_UPDATE" == "1" ]]; then
  git config --global --add safe.directory "$APP_DIR" || true
  git fetch --prune "$DEPLOY_REMOTE" "$DEPLOY_BRANCH"
  # Preserve host-specific secrets even during the first tracked -> ignored .env migration.
  test -f .env || { echo "Missing server .env; refusing deployment." >&2; exit 1; }
  install -d -m 700 /var/backups/watercleanbot
  env_backup="$(mktemp /var/backups/watercleanbot/env.XXXXXX)"
  env_mode="$(stat -c %a .env)"
  cp -p .env "$env_backup"
  chmod 600 "$env_backup"
  restore_env() {
    local status=$?
    cp -p "$env_backup" "$APP_DIR/.env"
    chmod "$env_mode" "$APP_DIR/.env"
    exit "$status"
  }
  trap restore_env EXIT
  git reset --hard "$DEPLOY_REMOTE/$DEPLOY_BRANCH"
  cp -p "$env_backup" .env
  chmod "$env_mode" .env
  trap - EXIT
fi

# Fail before replacing application artifacts when first-time setup is incomplete.
test -f .env || { echo "Missing server .env." >&2; exit 1; }
if ! grep -Eq '^CAMERA_HLS_BASE_URL=/video/?[[:space:]]*$' .env; then
  echo "Set CAMERA_HLS_BASE_URL=/video in the server .env (see deploy/README.md)." >&2
  exit 1
fi
APP_DIR="$APP_DIR" bash "$APP_DIR/scripts/install-video-proxy.sh"

export GOPROXY="${GOPROXY:-https://goproxy.cn,direct}"
export GOSUMDB="${GOSUMDB:-sum.golang.google.cn}"

go mod download

tmp_bin="$(mktemp)"
go build -buildvcs=false -trimpath -ldflags="-s -w" \
  -o "$tmp_bin" \
  ./cmd/watercleanbot

install -d -m 755 "$APP_DIR/bin"
if id waterbot >/dev/null 2>&1; then
  install -m 755 -o waterbot -g waterbot "$tmp_bin" "$APP_DIR/bin/watercleanbot"
else
  install -m 755 "$tmp_bin" "$APP_DIR/bin/watercleanbot"
fi
rm -f "$tmp_bin"

if [[ -f "$APP_DIR/web/app/package-lock.json" ]]; then
  npm --prefix "$APP_DIR/web/app" ci
else
  npm --prefix "$APP_DIR/web/app" install
fi

tmp_dist="$(mktemp -d)"
npm --prefix "$APP_DIR/web/app" run build -- --outDir "$tmp_dist" --emptyOutDir

rm -rf "$APP_DIR/web/app/dist.prev"
if [[ -d "$APP_DIR/web/app/dist" ]]; then
  mv "$APP_DIR/web/app/dist" "$APP_DIR/web/app/dist.prev"
fi
mv "$tmp_dist" "$APP_DIR/web/app/dist"
test -f "$APP_DIR/web/app/dist/index.html"
chmod -R a+rX "$APP_DIR/web/app/dist"
chmod a+X "$APP_DIR" "$APP_DIR/web" "$APP_DIR/web/app"

if [[ "${APPLY_DB_SCHEMA:-0}" == "1" ]]; then
  docker compose -f "$APP_DIR/docker-compose.yml" exec -T postgres \
    psql -U "${POSTGRES_USER:-waterbot}" -d "${POSTGRES_DB:-waterbot}" \
    < "$APP_DIR/database/build_extensions.sql"
  docker compose -f "$APP_DIR/docker-compose.yml" exec -T postgres \
    psql -U "${POSTGRES_USER:-waterbot}" -d "${POSTGRES_DB:-waterbot}" \
    < "$APP_DIR/database/create_robot_current_locations.sql"
  docker compose -f "$APP_DIR/docker-compose.yml" exec -T postgres \
    psql -U "${POSTGRES_USER:-waterbot}" -d "${POSTGRES_DB:-waterbot}" \
    < "$APP_DIR/database/create_planned_routes.sql"
fi

nginx -t
systemctl restart watercleanbot
systemctl reload nginx

for _ in {1..30}; do
  if systemctl is-active --quiet watercleanbot && \
     curl -fsS http://127.0.0.1:8080/api/robots/locations >/dev/null; then
    break
  fi

  sleep 1
done

if ! curl -fsS http://127.0.0.1:8080/api/robots/locations >/dev/null; then
  systemctl status watercleanbot --no-pager || true
  journalctl -u watercleanbot -n 80 --no-pager || true
  exit 1
fi

if ! curl -fsSI http://127.0.0.1/ >/dev/null; then
  ls -lah "$APP_DIR/web/app/dist" || true
  tail -n 80 /var/log/nginx/error.log || true
  exit 1
fi

echo "WaterCleanBot deployed: $(git rev-parse --short HEAD)"
