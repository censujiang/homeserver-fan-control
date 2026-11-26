#!/usr/bin/env bash
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo 'Run as root'; exit 1; }
test -x "${1:-}" || { echo 'Usage: install.sh /path/to/verified/binary'; exit 1; }
id homeserver-fan >/dev/null 2>&1 || useradd --system --no-create-home --shell /usr/sbin/nologin homeserver-fan
install -m 0755 "$1" /usr/local/bin/homeserver-fan-control
install -m 0644 "$(dirname "$0")/homeserver-fan-control.service" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now homeserver-fan-control
