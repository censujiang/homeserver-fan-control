#!/usr/bin/env bash
set -euo pipefail
version=$(bun -e 'console.log(require("./package.json").version)')
tmp=$(mktemp -d)
trap 'if [ -n "${pid:-}" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; cat "$tmp/log" 2>/dev/null || true; rm -rf "$tmp"' EXIT
cp dist/homeserver-fan-control "$tmp/app"
cd "$tmp"
qemu-x86_64 -cpu IvyBridge ./app --version >version.txt
test "$(cat version.txt)" = "$version"
qemu-x86_64 -cpu IvyBridge ./app --host 127.0.0.1 --port 18768 --data-dir "$tmp/data" >log 2>&1 & pid=$!
ready=0
for i in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:18768/api/auth/status >status.json; then ready=1; break; fi
  if ! kill -0 "$pid" 2>/dev/null; then echo "Emulated standalone exited"; exit 1; fi
  sleep 1
done
test "$ready" = 1
grep -q '"setup":true' status.json
test -f data/database.sqlite
test -s data/setup-token
curl -fsS http://127.0.0.1:18768/ >index.html
grep -q '/_nuxt/' index.html
echo "Ivy Bridge emulated startup, SQLite initialization and HTTP passed"
