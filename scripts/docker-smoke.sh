#!/usr/bin/env bash
set -euo pipefail
image=homeserver-fan-control:ci
name=hsfc-smoke-${GITHUB_RUN_ID:-$$}
vol=$name-data
trap 'docker logs "$name" 2>/dev/null || true; docker rm -f "$name" >/dev/null 2>&1 || true; docker volume rm "$vol" >/dev/null 2>&1 || true' EXIT
docker build --platform linux/amd64 --build-arg BINARY_SOURCE=prebuilt -t "$image" .
docker volume create "$vol"
docker run -d --name "$name" -p 127.0.0.1:18767:8080 -v "$vol:/data" "$image" --port 8080
for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:18767/api/auth/status > /tmp/hsfc-status.json; then break; fi; sleep 1; done
grep -q '"setup":true' /tmp/hsfc-status.json
test "$(docker exec "$name" id -u)" = 10001
docker exec "$name" test -f /data/database.sqlite
token=$(docker exec "$name" cat /data/setup-token)
curl -fsS -H 'Content-Type: application/json' -d "{\"token\":\"$token\",\"password\":\"docker-test-password\"}" http://127.0.0.1:18767/api/auth/setup
session=$(curl -fsS -H 'Content-Type: application/json' -d '{"password":"docker-test-password"}' http://127.0.0.1:18767/api/auth/login | python3 -c 'import sys,json;print(json.load(sys.stdin)["token"])')
curl -fsS -H "Authorization: Bearer $session" http://127.0.0.1:18767/api/update/status | python3 -c 'import sys,json;assert json.load(sys.stdin)["deployment"]=="docker"'
curl -fsS -H "Authorization: Bearer $session" http://127.0.0.1:18767/api/autostart/status | python3 -c 'import sys,json;x=json.load(sys.stdin);assert x["state"]=="unknown" and x["manager"]=="docker" and not x["canEnable"]'
docker rm -f "$name"
docker run -d --name "$name" -p 127.0.0.1:18767:3000 -v "$vol:/data" "$image"
for i in $(seq 1 40); do if curl -fsS http://127.0.0.1:18767/api/auth/status >/tmp/hsfc-status.json; then break; fi; sleep 1; done
grep -q '"setup":false' /tmp/hsfc-status.json
