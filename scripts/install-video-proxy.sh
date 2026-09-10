#!/usr/bin/env bash
# Install only a snippet; never replace the site's TLS, auth or API configuration.
set -Eeuo pipefail
APP_DIR="${APP_DIR:-/opt/watercleanbot}"
SITE="/etc/nginx/sites-enabled/watercleanbot"
TARGET="/etc/nginx/snippets/watercleanbot-video.conf"
BACKUP_DIR="/var/backups/watercleanbot"

if ! grep -Eq '^[[:space:]]*include[[:space:]]+/etc/nginx/snippets/watercleanbot-video\.conf[[:space:]]*;' "$SITE"; then
  echo "Missing video include in $SITE. Follow deploy/README.md before deployment." >&2
  exit 1
fi
install -d -m 700 "$BACKUP_DIR"
install -d -m 755 /etc/nginx/snippets
backup=""
if [[ -f "$TARGET" ]]; then
  backup="$(mktemp "$BACKUP_DIR/video.conf.XXXXXX")"
  cp -p "$TARGET" "$backup"
  chmod 600 "$backup"
fi
install -m 644 "$APP_DIR/deploy/nginx/video.conf" "$TARGET"
if ! nginx -t; then
  if [[ -n "$backup" ]]; then
    install -m 644 "$backup" "$TARGET"
  else
    rm -f -- "$TARGET"
  fi
  echo "Nginx validation failed; previous snippet restored. No reload was performed." >&2
  exit 1
fi
