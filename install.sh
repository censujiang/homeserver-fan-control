#!/usr/bin/env bash
# HomeServer Fan Control: install/update a verified published release.
set -euo pipefail
umask 077
repo=censujiang/homeserver-fan-control
binary=homeserver-fan-control-linux-x64-baseline
archive=homeserver-fan-control-docker-linux-amd64.tar.gz
die(){ printf '%s\n' "$*" >&2; exit 1; }
select_release(){
 python3 - "$@" <<'PY'
import json,re,sys
channel,mode,current,*paths=sys.argv[1:]
def version(s):
    m=re.fullmatch(r'v?(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})\.(0|[1-9][0-9]{0,8})(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?',s)
    if not m: return None
    pre=m[4].split('.') if m[4] else []
    if any(x.isdigit() and len(x)>1 and x[0]=='0' for x in pre): return None
    return (int(m[1]),int(m[2]),int(m[3]),not pre,tuple((0,int(x)) if x.isdigit() else (1,x) for x in pre))
minimum=version('0.3.0-alpha.4')
old=version(current) if current else None
if current and old is None: sys.exit('Invalid installed version')
name='homeserver-fan-control-linux-x64-baseline' if mode=='binary' else 'homeserver-fan-control-docker-linux-amd64.tar.gz'
candidates=[]
for path in paths:
    rows=json.load(open(path))
    if not isinstance(rows,list): sys.exit('Invalid GitHub releases response')
    for r in rows:
        if not isinstance(r,dict): continue
        tag=r.get('tag_name','')
        if not isinstance(tag,str) or not tag.startswith('v'): continue
        v=version(tag)
        if v is None or v<minimum or r.get('draft') is not False or not r.get('published_at'): continue
        if channel=='stable' and (r.get('prerelease') or not v[3]): continue
        if old is not None and v<=old: continue
        assets={a.get('name'):a.get('size') for a in r.get('assets',[]) if isinstance(a,dict) and a.get('state')=='uploaded'}
        if type(assets.get(name)) is not int or not 0<assets[name]<=256*1024*1024: continue
        if type(assets.get('SHA256SUMS')) is not int or not 0<assets['SHA256SUMS']<=65536: continue
        candidates.append((v,tag,assets[name]))
if candidates:
    _,tag,size=max(candidates)
    print(tag,size)
PY
}
# Offline selector for regression tests; no downloads or installation.
if [[ "${1:-}" == --select-release ]]; then shift; select_release "$@"; exit; fi
mode= channel=preview action= path= data= host= port= service= start= name=hsfc volume=hsfc-data remote_setup_ack=0
while (($#)); do
 case "$1" in
 --binary) mode=binary;; --docker) mode=docker;; --stable) channel=stable;; --preview) channel=preview;;
 --install) action=install;; --update) action=update;; --allow-remote-setup) remote_setup_ack=1;;
 --path|--data-dir|--host|--port|--service|--start|--name|--volume)
  (($#>=2)) || die "Missing value: $1"
  case "$1" in --path) path=$2;; --data-dir) data=$2;; --host) host=$2;; --port) port=$2;; --service) service=$2;; --start) start=$2;; --name) name=$2;; --volume) volume=$2;; esac
  shift;;
 -h|--help) cat <<'HELP'
HomeServer Fan Control installer / updater
  bash install.sh [--binary|--docker] [--install|--update] [--preview|--stable]
  Binary: --path FILE --data-dir DIR --host 127.0.0.1 --port 8080
          --start screen|systemd|none [--service UNIT]
  Docker: --name hsfc --volume hsfc-data --host 127.0.0.1 --port 8080
Preview is the default (includes Alpha/Beta/RC).
Use --host 0.0.0.0 for LAN access. On first install, confirm the restricted
network prompt (or explicitly pass --allow-remote-setup). Initialize promptly.
Existing custom processes must be stopped first; a verified running systemd
unit can be restarted automatically. Docker updates preserve standard
installer/README named-volume deployments; custom/Compose deployments
must use their original deployment definition.
HELP
 exit;;
 *) die "Unknown option: $1";;
 esac
 shift
done
[[ $(uname -s) == Linux && $(uname -m) == x86_64 ]] || die 'Linux x86_64 is required.'
for cmd in curl python3 sha256sum realpath mktemp; do command -v "$cmd" >/dev/null || die "Missing dependency: $cmd (Debian/PVE: apt install curl python3 coreutils)"; done
ask(){
 local prompt=$1 default=$2 answer
 printf '%s [%s]: ' "$prompt" "$default" >&2
 if ! IFS= read -r answer </dev/tty; then die 'Interactive terminal required; supply explicit options.'; fi
 printf '%s' "${answer:-$default}"
}
confirm(){ [[ $(ask "$1 (y/N)" n) =~ ^[yY]$ ]] || die 'Cancelled.'; }
if [[ -z $mode ]]; then
 printf '1) 独立二进制 / Standalone\n2) Docker\n' >&2
 case "$(ask '选择部署方式 / Deployment' 1)" in 1) mode=binary;; 2) mode=docker;; *) die 'Invalid selection';; esac
fi
[[ $mode == binary || $mode == docker ]] || die 'Invalid mode'
tmp=$(mktemp -d)
stage=
trap 'rm -rf -- "$tmp"; if [[ -n $stage ]]; then rm -f -- "$stage"; fi' EXIT
get(){ curl -fL --proto '=https' --proto-redir '=https' --connect-timeout 15 --max-time 300 --retry 2 "$@"; }
current=
existing=0
running=0
if [[ $mode == binary ]]; then
 default_path="$PWD/$binary"
 if [[ ! -e $default_path && -x /usr/local/bin/homeserver-fan-control ]]; then default_path=/usr/local/bin/homeserver-fan-control; fi
 [[ -n $path ]] || path=$(ask '程序路径 / Executable path' "$default_path")
 path=$(realpath -m -- "$path")
 [[ ! -d $path ]] || die 'Executable path is a directory.'
 if [[ -e $path ]]; then
  [[ -f $path && -x $path ]] || die 'Existing path is not an executable.'
  existing=1; current=$("$path" --version) || die 'Unable to read current version.'
 fi
 [[ -n $action ]] || { if ((existing)); then action=update; else action=install; fi; }
 [[ $action == update && $existing == 1 || $action == install && $existing == 0 ]] || die 'Install/update does not match existing executable.'
 # Detect actual processes by inode, not process name. Never kill an unknown process.
 pids=$(python3 - "$path" <<'PY'
import os,sys
try: target=os.stat(sys.argv[1])
except FileNotFoundError: sys.exit()
for p in os.listdir('/proc'):
    if not p.isdigit(): continue
    try:
        s=os.stat('/proc/'+p+'/exe')
        if (s.st_dev,s.st_ino)==(target.st_dev,target.st_ino): print(p)
    except OSError: pass
PY
 )
 if [[ -z $service && -n $pids ]] && command -v systemctl >/dev/null; then
  for unit in $(systemctl list-units --type=service --state=running --no-legend --plain 2>/dev/null | awk '/homeserver-fan-control.*\.service/{print $1}' || true); do
   pid=$(systemctl show "$unit" -p MainPID --value)
   if grep -Fxq "$pid" <<<"$pids"; then service=$unit; break; fi
  done
 fi
 if [[ -n $service ]]; then
  [[ $service =~ ^[a-zA-Z0-9_.@-]+\.service$ ]] || die 'Invalid systemd unit.'
  pid=$(systemctl show "$service" -p MainPID --value)
  [[ -n $pids ]] && grep -Fxq "$pid" <<<"$pids" || die 'Service main process does not match this executable. Stop it and update with --start none, then start the original unit.'
  running=1
  # Read only non-secret launch settings from the verified main process.
  # The service definition itself stays unchanged.
  python3 - "$pid" >"$tmp/service-config" <<'PY'
import os,sys
p='/proc/'+sys.argv[1]
env=dict(x.split(b'=',1) for x in open(p+'/environ','rb').read().split(b'\0') if b'=' in x)
args=[os.fsdecode(x) for x in open(p+'/cmdline','rb').read().split(b'\0') if x][1:]
d=os.fsdecode(env.get(b'HSFC_DATA_DIR',b'./data'))
host=os.fsdecode(env.get(b'NITRO_HOST',env.get(b'HOST',b'127.0.0.1')))
port=os.fsdecode(env.get(b'NITRO_PORT',env.get(b'PORT',b'3000')))
i=0
while i<len(args):
    flag,sep,value=args[i].partition('=')
    if flag in ('--data-dir','--host','-H','--port','-p'):
        if not sep:
            i+=1
            if i>=len(args): sys.exit('Missing launch argument')
            value=args[i]
        if flag=='--data-dir': d=value
        elif flag in ('--host','-H'): host=value
        else: port=value
    i+=1
if not os.path.isabs(d): d=os.path.join(os.readlink(p+'/cwd'),d)
d=os.path.realpath(d)
if not os.path.isdir(d) or not os.path.isfile(os.path.join(d,'database.sqlite')): sys.exit('Cannot verify service data directory')
if any('\n' in x or '\r' in x for x in (d,host,port)): sys.exit('Unsupported service launch arguments')
print(d,host,port,sep='\n')
PY
  mapfile -t svc_cfg <"$tmp/service-config"
  [[ -z $data || $(realpath -m -- "$data") == "${svc_cfg[0]}" ]] || die 'Specified data directory differs from running service.'
  data=${svc_cfg[0]}; host=${svc_cfg[1]}; port=${svc_cfg[2]}
  # Keep original unit arguments, environment, user and data directory.
  [[ -z $start || $start == systemd ]] || die 'Existing service must retain systemd.'
  start=systemd
 else
  [[ -z $pids ]] || die 'Executable is running outside a verified systemd unit. Stop the original Screen/foreground process, then rerun this installer.'
  [[ -n $data ]] || data=$(ask '数据目录 / Existing or new data directory' "$(dirname "$path")/data")
  data=$(realpath -m -- "$data")
  if ((existing)); then [[ -f $data/database.sqlite && -f $data/config.key ]] || die "Existing data directory not found; specify the actual --data-dir (no changes made)."; fi
  [[ -n $host ]] || host=$(ask '监听地址 / Listen address' 127.0.0.1)
  [[ -n $port ]] || port=$(ask '端口 / Port' 8080)
  [[ -n $start ]] || start=$(ask '启动方式 / Start (screen/systemd/none)' screen)
  [[ $start == screen || $start == systemd || $start == none ]] || die 'Invalid start mode'
  if [[ $start == screen ]]; then command -v screen >/dev/null || die 'Install screen first (apt install screen), or select systemd/none.'; fi
  if [[ $start == systemd ]]; then command -v systemctl >/dev/null || die 'systemd unavailable'; [[ $(id -u) == 0 ]] || die 'For non-root systemd, use --start none and the generated user startup script.'; fi
 fi
else
 command -v docker >/dev/null || die 'Install Docker Engine first.'
 docker info >/dev/null || die 'Docker daemon unavailable or permission denied.'
 [[ $name =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ && $volume =~ ^[a-zA-Z0-9][a-zA-Z0-9_.-]*$ ]] || die 'Invalid container/volume name.'
 if docker container inspect "$name" >"$tmp/container.json" 2>/dev/null; then
  existing=1
  # Only reconstruct the known simple deployment; refuse custom Compose, devices,
  # bind mounts, commands, networking and privilege options rather than dropping them.
  python3 - "$tmp/container.json" >"$tmp/docker-config" <<'PY'
import json,re,sys
x=json.load(open(sys.argv[1]))[0]; c=x['Config']; h=x['HostConfig']; m=x['Mounts']
def reject(): sys.exit('Custom Docker configuration detected. Update using the original docker run/Compose definition; no changes made.')
if not re.fullmatch(r'homeserver-fan-control:(?:ci|v[0-9A-Za-z.-]+)',c.get('Image','')): reject()
if c.get('Entrypoint')!=['/usr/local/bin/homeserver-fan-control'] or c.get('User')!='10001:10001': reject()
if any(k.startswith('com.docker.compose.') for k in (c.get('Labels') or {})): reject()
if any(h.get(k) for k in ['IpcMode','PidMode','UTSMode','UsernsMode','CgroupParent','VolumeDriver','Runtime']) and (h.get('IpcMode') not in (None,'','private','shareable') or h.get('PidMode') or h.get('UTSMode') or h.get('UsernsMode') or h.get('CgroupParent') or h.get('VolumeDriver') or h.get('Runtime') not in (None,'','runc')): reject()
if h.get('Privileged') or h.get('Devices') or h.get('DeviceRequests') or h.get('GroupAdd') or h.get('CapAdd') or h.get('CapDrop') or h.get('NetworkMode') not in ('default','bridge') or h.get('ExtraHosts') or h.get('Links') or h.get('ReadonlyRootfs') or h.get('AutoRemove'): reject()
if h.get('SecurityOpt') not in (None,[],['no-new-privileges:true']): reject()
if len(m)!=1 or m[0].get('Type')!='volume' or m[0].get('Destination')!='/data' or not m[0].get('RW'): reject()
if h.get('RestartPolicy',{}).get('Name') not in ('','no','unless-stopped','always'): reject()
p=h.get('PortBindings') or {}
if len(p)!=1: reject()
internal,bindings=next(iter(p.items()))
if not re.fullmatch(r'[0-9]+/tcp',internal) or len(bindings)!=1: reject()
internal=internal.split('/')[0]
cmd=c.get('Cmd') or []
if cmd not in ([],['--port',internal]): reject()
env=dict(e.split('=',1) for e in c.get('Env',[]) if '=' in e)
allowed={'PATH','HSFC_DEPLOYMENT','HSFC_DATA_DIR','NITRO_HOST','NITRO_PORT','HSFC_ALLOW_REMOTE_SETUP'}
if set(env)-allowed or env.get('HSFC_DATA_DIR')!='/data' or env.get('NITRO_HOST')!='0.0.0.0': reject()
if env.get('NITRO_PORT','3000')!=internal and not cmd: reject()
if any(h.get(k) for k in ['Memory','NanoCpus','CpuShares','CpuQuota','CpusetCpus','PidsLimit','Ulimits','Tmpfs','Dns','DnsSearch','DnsOptions']): reject()
ip=bindings[0].get('HostIp') or '0.0.0.0'
port=bindings[0].get('HostPort','')
if not re.fullmatch(r'[0-9]+',port) or ip not in ('127.0.0.1','0.0.0.0'): reject()
print(ip,port,internal,m[0]['Name'],h['RestartPolicy']['Name'] or 'no', '1' if x['State']['Running'] else '0',sep='\n')
PY
  mapfile -t cfg <"$tmp/docker-config"
  host=${cfg[0]}; port=${cfg[1]}; internal=${cfg[2]}; volume=${cfg[3]}; restart=${cfg[4]}; running=${cfg[5]}
  oldimage=$(docker inspect --format '{{.Image}}' "$name")
  current=$(docker run --rm --network none "$oldimage" --version)
 else
  [[ -n $host ]] || host=$(ask '宿主监听地址 / Host bind address' 127.0.0.1)
  [[ -n $port ]] || port=$(ask '宿主端口 / Host port' 8080)
  internal=3000; restart=unless-stopped
  if docker volume inspect "$volume" >/dev/null 2>&1; then confirm "数据卷 $volume 已存在，确认复用？ / Reuse existing volume $volume?"; fi
 fi
 [[ -n $action ]] || { if ((existing)); then action=update; else action=install; fi; }
 [[ $action == update && $existing == 1 || $action == install && $existing == 0 ]] || die 'Install/update does not match existing container.'
 [[ $host == 127.0.0.1 || $host == 0.0.0.0 ]] || die 'Supported Docker bind: 127.0.0.1 or 0.0.0.0.'
fi
if [[ -z $service ]]; then
 [[ $port =~ ^[0-9]{1,5}$ ]] && ((10#$port>=1 && 10#$port<=65535)) || die 'Invalid port.'
 [[ $host == 127.0.0.1 || $host == 0.0.0.0 ]] || die 'Supported bind: 127.0.0.1 or 0.0.0.0.'
fi
# Fetch all pages (bounded, fail rather than silently truncate).
pages=()
for ((page=1;page<=20;page++)); do
 file="$tmp/releases-$page.json"
 get -sS -H 'Accept: application/vnd.github+json' "https://api.github.com/repos/$repo/releases?per_page=100&page=$page" -o "$file"
 count=$(python3 -c 'import json,sys;x=json.load(open(sys.argv[1]));assert isinstance(x,list);print(len(x))' "$file")
 pages+=("$file")
 ((count<100)) && break
 ((page<20)) || die 'Too many release pages; refusing incomplete selection.'
done
selection=$(select_release "$channel" "$mode" "$current" "${pages[@]}")
if [[ -z $selection ]]; then
 if ((existing)); then echo "No newer complete $channel release (installed: $current)."; exit 0; fi
 die "No compatible published $channel release. Try --preview."
fi
read -r tag size <<<"$selection"
asset=$binary; [[ $mode == binary ]] || asset=$archive
printf 'Mode: %s / %s\nInstalled: %s\nSelected: %s\n' "$mode" "$action" "${current:-none}" "$tag"
if ((existing)); then confirm '已停止真实 ADAPTIVE 调速并确认 BMC AUTO，继续更新？ / Physical control stopped and BMC AUTO confirmed?'; fi
if [[ $host == 0.0.0.0 ]]; then
 if ((!existing)); then
  echo '警告：首次初始化前，任何能访问此端口的人均可能抢先创建管理员。仅允许可信管理设备访问，勿开放公网。 / Restrict access to trusted administrators before initial setup.'
  if ((!remote_setup_ack)); then confirm '已限制管理端口访问，允许局域网首次初始化？ / Allow first setup on the restricted LAN?'; fi
 else
  confirm '已限制管理端口访问且不向公网暴露？ / Confirm restricted management network?'
 fi
fi
base="https://github.com/$repo/releases/download/$tag"
get -sS "$base/SHA256SUMS" -o "$tmp/SHA256SUMS"
get "$base/$asset" -o "$tmp/$asset"
python3 - "$tmp" "$asset" "$size" <<'PY'
import pathlib,re,sys,hashlib
d=pathlib.Path(sys.argv[1]); name=sys.argv[2]; size=int(sys.argv[3]); p=d/name
if p.stat().st_size!=size or (d/'SHA256SUMS').stat().st_size>65536: sys.exit('Asset size mismatch')
rows=[m[1].lower() for line in (d/'SHA256SUMS').read_text().splitlines() if (m:=re.fullmatch(r'([0-9a-fA-F]{64}) [ *]'+re.escape(name),line))]
with p.open('rb') as f:
    h=hashlib.sha256()
    for chunk in iter(lambda:f.read(1024*1024),b''): h.update(chunk)
if len(rows)!=1 or rows[0]!=h.hexdigest(): sys.exit('SHA-256 verification failed')
print('SHA-256 OK')
PY
stamp=$(date +%Y%m%d-%H%M%S)-$$
if [[ $mode == binary ]]; then
 chmod 700 "$tmp/$asset"
 [[ $("$tmp/$asset" --version) == "${tag#v}" ]] || die 'Downloaded executable version mismatch.'
 mkdir -p -- "$(dirname "$path")"
 stage=$(mktemp "$(dirname "$path")/.hsfc-install-XXXXXX")
 install -m 0755 "$tmp/$asset" "$stage"
 if ((existing)); then
  # Preserve old ownership and mode (system-level services may use a dedicated account).
  chmod --reference="$path" "$stage"
  if [[ $(id -u) == 0 ]]; then chown --reference="$path" "$stage"; fi
  backup="$path.previous-$current-$stamp"
  cp -p -- "$path" "$backup"
  echo "Executable backup: $backup"
 fi
 if [[ -n $service ]]; then
  confirm '停止并重启原 systemd 服务？ / Restart existing service?'
  systemctl stop "$service"
  [[ -d $data && -f $data/database.sqlite ]] || { systemctl start "$service"; die 'Data directory unavailable; original service restarted.'; }
 fi
 if [[ -n $data && -d $data && $existing == 1 ]]; then
  backup_data="$data.backup-$stamp"
  if ! cp -a -- "$data" "$backup_data"; then [[ -z $service ]] || systemctl start "$service"; die 'Data backup failed'; fi
  echo "Data backup: $backup_data"
 fi
 if ! mv -f -- "$stage" "$path"; then [[ -z $service ]] || systemctl start "$service"; die 'Replacement failed'; fi
 stage=
 if [[ -n $service ]]; then
  healthy=0
  if systemctl start "$service"; then
   address=$host; [[ $address != 0.0.0.0 ]] || address=127.0.0.1
   [[ $address != :: ]] || address=::1
   [[ $address != *:* || $address == \[*\] ]] || address="[$address]"
   for ((i=0;i<45;i++)); do
    if systemctl is-active --quiet "$service" && curl -fsS --noproxy '*' --connect-timeout 1 --max-time 2 "http://$address:$port/api/auth/status" >"$tmp/health.json" 2>/dev/null && python3 -c 'import json,sys;x=json.load(open(sys.argv[1]));assert x.get("version")==sys.argv[2] or ("version" not in x and isinstance(x.get("setup"),bool))' "$tmp/health.json" "${tag#v}" 2>/dev/null; then healthy=1; break; fi
    sleep 1
   done
  fi
  if ((!healthy)); then
   systemctl stop "$service" || true
   cp -p -- "$backup" "$path.rollback-$stamp"; mv -f -- "$path.rollback-$stamp" "$path"
   systemctl start "$service" || true; die 'New service failed; binary rollback attempted. Check database backup and logs.'
  fi
  echo "Updated existing systemd service: $service"
 else
  mkdir -p -- "$data"
  args=(--host "$host" --port "$port" --data-dir "$data")
  # The application rejects remote initialization unless explicitly opted in.
  # Older releases used a setup key and do not support this flag.
  lan_setup=0
  if ((!existing)) && [[ $host == 0.0.0.0 ]]; then
   if "$path" --help | grep -q -- '--allow-remote-setup'; then
    lan_setup=1
    args+=(--allow-remote-setup)
   fi
  fi
  case "$start" in
   none) printf 'Start: '; printf '%q ' "$path" "${args[@]}"; printf '\n';;
   screen)
    session="hsfc-$port"
    screen -dmS "$session" "$path" "${args[@]}"
    echo "Attach: screen -r $session (Ctrl+A then D to detach)";;
   systemd)
    "$path" --generate-autostart-script "${args[@]}"
    sh "$data/setup-autostart.sh"
    # The generated persistent unit deliberately excludes setup permission.
    # For fresh LAN installation grant it through a boot-scoped drop-in.
    if ((lan_setup)); then
     dropin=/run/systemd/system/homeserver-fan-control.service.d/90-hsfc-first-setup.conf
     mkdir -p -- "$(dirname "$dropin")"
     (set -o noclobber; printf '[Service]\nEnvironment=HSFC_ALLOW_REMOTE_SETUP=1\n' > "$dropin") || die 'Existing first-setup drop-in; inspect it before starting.'
     systemctl daemon-reload
    fi
    systemctl start homeserver-fan-control.service
    if ((lan_setup)); then echo "After creating the administrator, remove $dropin and run systemctl daemon-reload. The permission also expires on reboot."; fi;;
  esac
  if [[ $host == 0.0.0.0 ]]; then echo "Web: http://SERVER_LAN_IP:$port"; else echo "Web: http://$host:$port"; fi
  if ((lan_setup)) && [[ $start != systemd ]]; then echo 'After creating the administrator, omit --allow-remote-setup on future launches.'; fi
  if [[ $host == 127.0.0.1 ]]; then echo "SSH tunnel: ssh -L $port:127.0.0.1:$port USER@SERVER"; fi
 fi
else
 docker load -i "$tmp/$asset"
 imageid=$(docker image inspect --format '{{.Id}}' homeserver-fan-control:ci)
 [[ $(docker run --rm --network none "$imageid" --version) == "${tag#v}" ]] || die 'Loaded image version mismatch.'
 image="homeserver-fan-control:$tag"
 docker tag "$imageid" "$image"
 backup_name="$name-previous-$stamp"
 if ((existing)); then
  docker stop -t 90 "$name" >/dev/null
  backup_data="$PWD/hsfc-data-backup-$stamp"
  mkdir -m 700 -- "$backup_data"
  if ! docker cp "$name:/data/." "$backup_data/"; then ((running==0)) || docker start "$name"; die 'Data backup failed'; fi
  if ! docker rename "$name" "$backup_name"; then ((running==0)) || docker start "$name"; die 'Container rename failed'; fi
  # Prevent the retired container from being started at next boot.
  if ! docker update --restart no "$backup_name" >/dev/null; then docker rename "$backup_name" "$name"; ((running==0)) || docker start "$name"; die 'Cannot disable old restart policy'; fi
 fi
 # First setup supports loopback and explicitly confirmed LAN binding.
 extra=()
 if ((!existing)); then
  extra=(-e HSFC_ALLOW_REMOTE_SETUP=1)
 fi
 ok=0
 if docker run -d --name "$name" --restart "$restart" -p "$host:$port:$internal" -v "$volume:/data" --security-opt no-new-privileges:true "${extra[@]}" "$image" --port "$internal"; then
  for ((i=0;i<45;i++)); do
   if curl -fsS --noproxy '*' --connect-timeout 1 --max-time 2 "http://127.0.0.1:$port/api/auth/status" >"$tmp/health.json" 2>/dev/null && python3 -c 'import json,sys;x=json.load(open(sys.argv[1]));assert x.get("version")==sys.argv[2] or ("version" not in x and isinstance(x.get("setup"),bool))' "$tmp/health.json" "${tag#v}" 2>/dev/null; then ok=1; break; fi
   sleep 1
  done
 fi
 if ((!ok)); then
  docker logs --tail 20 "$name" 2>/dev/null || true
  docker rm -f "$name" >/dev/null 2>&1 || true
  if ((existing)); then docker rename "$backup_name" "$name"; docker update --restart "$restart" "$name" >/dev/null; ((running==0)) || docker start "$name"; fi
  die 'Container failed startup; previous container restored if available. Check data backup.'
 fi
 if ((existing)); then echo "Previous stopped container: $backup_name; data backup: $backup_data"; fi
 if [[ $host == 0.0.0.0 ]]; then echo "Web: http://SERVER_LAN_IP:$port"; else echo "Web: http://$host:$port"; fi
 if ((!existing)); then echo "After initial setup, remove HSFC_ALLOW_REMOTE_SETUP=1 on the next container recreation; keep the same volume."; fi
fi
echo "Installed $tag. Data is preserved. / 安装或更新完成。"
if ((!existing)); then echo "Open the Web UI to initialize the administrator promptly (alpha.5 and older require the setup-token file)."; fi
