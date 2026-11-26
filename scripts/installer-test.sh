#!/usr/bin/env bash
set -euo pipefail
bash -n install.sh
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
python3 - "$tmp/releases.json" <<'PY'
import json,sys
assets=[dict(name='homeserver-fan-control-linux-x64-baseline',state='uploaded',size=100),dict(name='homeserver-fan-control-docker-linux-amd64.tar.gz',state='uploaded',size=200),dict(name='SHA256SUMS',state='uploaded',size=100)]
def rel(tag,pre=True,draft=False,complete=True):
 return dict(tag_name=tag,prerelease=pre,draft=draft,published_at='2026-11-26',assets=assets if complete else [])
json.dump([rel('v0.3.0-alpha.9'),rel('v0.3.0-alpha.8'),rel('v0.3.0-alpha.11'),rel('v0.3.0-alpha.10'),rel('v9.0.0',False,True),rel('v8.0.0',False,False,False)],open(sys.argv[1],'w'))
PY
test "$(bash install.sh --select-release preview binary '' "$tmp/releases.json")" = 'v0.3.0-alpha.11 100'
test "$(bash install.sh --select-release preview docker 0.3.0-alpha.9 "$tmp/releases.json")" = 'v0.3.0-alpha.11 200'
test -z "$(bash install.sh --select-release stable binary '' "$tmp/releases.json")"
test -z "$(bash install.sh --select-release preview binary 0.3.0-alpha.11 "$tmp/releases.json")"
bash install.sh --help | grep -q -- '--docker'

# Mock the network for a real installer download/checksum/install path without root,
# systemd, Docker, or a public GitHub request.
mkdir -p "$tmp/fakebin" "$tmp/fixture"
asset=homeserver-fan-control-linux-x64-baseline
printf '%s\n' '#!/bin/sh' 'if [ "$1" = --version ]; then echo 0.3.0-alpha.11; exit 0; fi' 'exit 1' >"$tmp/fixture/$asset"
(cd "$tmp/fixture" && sha256sum "$asset" > SHA256SUMS)
python3 - "$tmp/fixture" "$asset" <<'PY'
import json,sys,pathlib
d=pathlib.Path(sys.argv[1]);name=sys.argv[2]
json.dump([dict(tag_name='v0.3.0-alpha.11',draft=False,prerelease=True,published_at='2026-11-26',assets=[dict(name=n,size=(d/n).stat().st_size,state='uploaded') for n in (name,'SHA256SUMS')])],open(d/'releases.json','w'))
PY
cat >"$tmp/fakebin/curl" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
url= out=
while (($#)); do
 case "$1" in
 https://*) url=$1;;
 -o) shift; out=$1;;
 esac
 shift
done
case "$url" in
 https://api.github.com/*) src=releases.json;;
 https://github.com/*/SHA256SUMS) src=SHA256SUMS;;
 https://github.com/*/homeserver-fan-control-linux-x64-baseline) src=homeserver-fan-control-linux-x64-baseline;;
 *) exit 1;;
esac
cp "$HSFC_INSTALL_TEST_FIXTURE/$src" "$out"
SH
chmod +x "$tmp/fakebin/curl"
PATH="$tmp/fakebin:$PATH" HSFC_INSTALL_TEST_FIXTURE="$tmp/fixture" bash install.sh --binary --install --path "$tmp/app" --data-dir "$tmp/data" --host 127.0.0.1 --port 8080 --start none
test "$("$tmp/app" --version)" = 0.3.0-alpha.11
# A tampered artifact must never be installed.
printf 'corrupt' >"$tmp/fixture/$asset"
if PATH="$tmp/fakebin:$PATH" HSFC_INSTALL_TEST_FIXTURE="$tmp/fixture" bash install.sh --binary --install --path "$tmp/bad-app" --data-dir "$tmp/bad-data" --host 127.0.0.1 --port 8080 --start none; then
 echo 'Tampered artifact accepted' >&2; exit 1
fi
test ! -e "$tmp/bad-app"
