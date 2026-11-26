#!/usr/bin/env bash
set -euo pipefail
version=$(bun -e 'console.log(require("./package.json").version)')
tmp=$(mktemp -d)
trap 'if [ -n "${pid:-}" ]; then kill "$pid" 2>/dev/null || true; wait "$pid" 2>/dev/null || true; fi; rm -rf "$tmp"' EXIT
cp dist/homeserver-fan-control "$tmp/app"
cd "$tmp"
export HSFC_DATA_DIR="$tmp/data" NITRO_HOST=127.0.0.1 NITRO_PORT=18766
./app --port 18765 --host 127.0.0.1 >log 2>&1 & pid=$!
for i in $(seq 1 60); do if curl -fsS http://127.0.0.1:18765/api/auth/status >status.json; then break; fi; sleep 1; done
cat log
grep -q '"setup":true' status.json
curl -fsS http://127.0.0.1:18765/ >index.html
curl -fsS http://127.0.0.1:18765/servers >/dev/null
grep -oE '/_nuxt/[^" ]+\.(js|css)' index.html | sort -u >assets
test -s assets
while read -r asset; do curl -fsS "http://127.0.0.1:18765$asset" >/dev/null; done <assets
test -f data/database.sqlite
./app --help | grep -q -- --port
if ./app --port 65536; then echo "Invalid port accepted"; exit 1; fi
token=$(cat data/setup-token)
curl -fsS -H 'Content-Type: application/json' -d "{\"token\":\"$token\",\"password\":\"test-password-1234\"}" http://127.0.0.1:18765/api/auth/setup
session=$(curl -fsS -H 'Content-Type: application/json' -d '{"password":"test-password-1234"}' http://127.0.0.1:18765/api/auth/login | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -fsS -H "Authorization: Bearer $session" http://127.0.0.1:18765/api/dashboard | grep -q huawei.imana200
test "$(./app --version)" = "$version"
test "$(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:18765/api/update/status)" = 401
curl -fsS -H "Authorization: Bearer $session" http://127.0.0.1:18765/api/update/status | python3 -c 'import sys,json;x=json.load(sys.stdin);assert x["deployment"]=="binary" and x["current"]==sys.argv[1]' "$version"
curl -fsS -H "Authorization: Bearer $session" -H 'Content-Type: application/json' -d '{"name":"Smoke test","plugin":"mock","transport":"mock","mode":"DRY_RUN","config":{},"policy":{"sensors":[{"id":"cpu","warm":40,"hot":65}],"fans":["fan"]}}' http://127.0.0.1:18765/api/instances
sleep 7
curl -fsS -H "Authorization: Bearer $session" http://127.0.0.1:18765/api/dashboard | grep -q '"online":true'
kill "$pid"; wait "$pid" || true; unset pid
./app -p 18765 >>log 2>&1 & pid=$!
for i in $(seq 1 30); do if curl -fsS http://127.0.0.1:18765/api/auth/status >status.json; then break; fi; sleep 1; done
grep -q '"setup":false' status.json
session=$(curl -fsS -H 'Content-Type: application/json' -d '{"password":"test-password-1234"}' http://127.0.0.1:18765/api/auth/login | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -fsS -H "Authorization: Bearer $session" http://127.0.0.1:18765/api/dashboard | grep -q 'Smoke test'
