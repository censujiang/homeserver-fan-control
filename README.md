# HomeServer Fan Control

[简体中文](#简体中文) | [English](#english)

[![Build and verify](https://github.com/censujiang/homeserver-fan-control/actions/workflows/ci.yml/badge.svg)](https://github.com/censujiang/homeserver-fan-control/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 简体中文

面向家庭服务器、个人工作室及小型办公室的服务器智能散热管理项目。采用 Nuxt + Vue SPA、Nitro 后台任务、Bun 与 SQLite；浏览器关闭后监控仍独立运行。硬件驱动与温控策略通过统一插件接口解耦。

**当前版本为公开 Alpha 安全预览，并非生产级风扇控制器。** 当前物理硬件驱动不执行真实写入；真实 ADAPTIVE 暂不可启用。请维持 BMC 原厂 AUTO。Mock 驱动可模拟自适应调速、有限手动租约和故障回退。

### 功能

- Web 管理后台：服务器管理、实时传感器状态、表单式温控策略（可选高级 JSON）、历史采样、异常事件、中英文及亮暗主题。
- 内置与外置硬件插件，支持按插件选择连接方式。参见[内置插件目录](docs/plugins/builtin/README.md)。
- SQLite WAL 持久化、管理员密码哈希、连接配置加密。
- 外置 ZIP 插件安装、校验及管理；隔离执行是实验功能，默认关闭。
- Linux x86_64 baseline 单文件、Docker 镜像、Compose、systemd。

### 快速开始：独立二进制（推荐 Linux 裸金属 / 物理机）

老款 x86_64 CPU（如 Ivy Bridge / Xeon E5 v2）请使用 v0.3.0-alpha.4 或更新的发行版。alpha.1–alpha.3 内嵌 Bun 1.3.13，已在实机发现 Illegal instruction。alpha.4 起采用 Bun 1.4.5 的统一 x64 构建，保留原发行附件名称以兼容下载和更新器。

在 Linux x86_64 物理机上复制以下命令即可下载、校验并启动（需要 curl、python3 和 sha256sum）。自动选择已发布且附件齐全的版本（含预发行版），其他版本请查看 [Releases](https://github.com/censujiang/homeserver-fan-control/releases)。建议优先在被管理的裸金属 Linux 服务器运行；虚拟机或其他主机也可使用兼容的远程插件。

```sh
BASE=$(curl -fsSL 'https://api.github.com/repos/censujiang/homeserver-fan-control/releases?per_page=30' | python3 -c 'import json,sys; releases=json.load(sys.stdin); required={"homeserver-fan-control-linux-x64-baseline","homeserver-fan-control-docker-linux-amd64.tar.gz","SHA256SUMS"}; print(next("https://github.com/censujiang/homeserver-fan-control/releases/download/"+r["tag_name"] for r in releases if not r["draft"] and required <= {a["name"] for a in r["assets"] if a["state"]=="uploaded"}))') && \
curl -fL --connect-timeout 15 --retry 3 "$BASE/homeserver-fan-control-linux-x64-baseline" -o homeserver-fan-control-linux-x64-baseline && \
curl -fL --connect-timeout 15 --max-time 60 --retry 3 "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-linux-x64-baseline$' SHA256SUMS | sha256sum -c - && \
chmod +x homeserver-fan-control-linux-x64-baseline && \
./homeserver-fan-control-linux-x64-baseline --port 8080
```

默认只监听 127.0.0.1:3000。上例为 127.0.0.1:8080，无需安装 Bun、Node.js 或 npm。
从 alpha.6 起，首次打开页面直接设置并确认管理员密码（12～128 字符），无需 setup key。默认只允许回环监听上的本机初始化；远程服务器可用 `ssh -L 8080:127.0.0.1:8080 user@server` 建立隧道，再打开 http://127.0.0.1:8080。旧版 alpha.5 及以前仍需要密钥（`cat ./data/setup-token; echo`）。

**SSH 断开后继续运行（Debian/Ubuntu/PVE）：** 先停止当前前台程序（Ctrl+C），不要重复启动同一数据目录。

```sh
sudo apt-get install -y screen
screen -dmS hsfc ./homeserver-fan-control-linux-x64-baseline --port 8080 --data-dir ./data
screen -ls
```

使用 `screen -r hsfc` 重新连接，按 Ctrl+A 然后 D 分离；SSH 断开不会通常终止 Screen 会话，但宿主机重启不会自动恢复。长期使用推荐 systemd。

如果是在可信局域网首次直接访问（先限制防火墙访问，仅允许管理员；不对公网开放），可临时使用 `--host 0.0.0.0 --allow-remote-setup` 启动，设置密码后移除初始化选项再启动。

### 启动参数与环境变量

| 参数 | 环境变量（按优先级） | 默认值 |
|---|---|---|
| `-p` / `--port` | `NITRO_PORT` / `PORT` | 3000 |
| `-H` / `--host` | `NITRO_HOST` / `HOST` | 127.0.0.1 |
| `--data-dir` | `HSFC_DATA_DIR` | ./data |
| `--allow-remote-setup` | `HSFC_ALLOW_REMOTE_SETUP=1` | off / 关闭 |
| `-h` / `--help` | — | 显示帮助 |

命令行优先于环境变量，端口必须为 1–65535 的整数。普通用户监听 1024 以下端口可能需要额外权限。

```sh
./homeserver-fan-control-linux-x64-baseline --host 0.0.0.0 --port 18080 --data-dir ./hsfc-data
PORT=18080 ./homeserver-fan-control-linux-x64-baseline
```

开放局域网前请配置防火墙与 HTTPS 反向代理。不要将 HTTP 管理后台直接暴露至公网。

### Docker 部署（Linux amd64）

**方式 A：下载已构建的发行镜像，不需要源码。**

复制以下命令下载发行镜像、校验并导入（需要 curl、python3 和 sha256sum）：

```sh
BASE=$(curl -fsSL 'https://api.github.com/repos/censujiang/homeserver-fan-control/releases?per_page=30' | python3 -c 'import json,sys; releases=json.load(sys.stdin); required={"homeserver-fan-control-linux-x64-baseline","homeserver-fan-control-docker-linux-amd64.tar.gz","SHA256SUMS"}; print(next("https://github.com/censujiang/homeserver-fan-control/releases/download/"+r["tag_name"] for r in releases if not r["draft"] and required <= {a["name"] for a in r["assets"] if a["state"]=="uploaded"}))') && \
curl -fL --connect-timeout 15 --retry 3 "$BASE/homeserver-fan-control-docker-linux-amd64.tar.gz" -o homeserver-fan-control-docker-linux-amd64.tar.gz && \
curl -fL --connect-timeout 15 --max-time 60 --retry 3 "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-docker-linux-amd64.tar.gz$' SHA256SUMS | sha256sum -c - && \
docker load -i homeserver-fan-control-docker-linux-amd64.tar.gz && \
docker run -d --name hsfc --restart unless-stopped \
  -p 127.0.0.1:8080:3000 \
  -v hsfc-data:/data -e HSFC_ALLOW_REMOTE_SETUP=1 \
  --security-opt no-new-privileges:true \
  homeserver-fan-control:ci
```

宿主机访问 8080，容器内部监听 3000。首次通过回环映射进入页面创建管理员（alpha.6 起）；环境变量 HSFC_ALLOW_REMOTE_SETUP=1 仅用于初次设置，完成后建议重建容器移除变量并保留数据卷。也支持直接改变容器内部端口：

```sh
docker run -d --name hsfc-custom \
  -p 127.0.0.1:18080:9000 -v hsfc-custom-data:/data -e HSFC_ALLOW_REMOTE_SETUP=1 \
  homeserver-fan-control:ci --port 9000
```

容器默认监听 0.0.0.0，使用 UID/GID 10001 的非 root 用户。端口映射默认仅绑定宿主机回环地址。要开放局域网，可以把映射改成 `-p 8080:3000`，并做好网络访问控制。

**方式 B：从源码构建和运行 Compose。**

```sh
git clone https://github.com/censujiang/homeserver-fan-control.git
cd homeserver-fan-control
HSFC_ALLOW_REMOTE_SETUP=1 HSFC_HOST_PORT=8080 docker compose up -d --build
docker compose logs -f
```

`HSFC_HOST_PORT` 只改变宿主机端口。Compose 的 `command: ["--port", "9000"]` 可改变容器内部端口，同时将 ports 的目标端口改为 9000。数据卷默认保留；不要执行 `docker compose down -v`，除非确实需要删除数据。

### 内置插件与硬件接入

请按硬件类型选择插件。各插件的连接配置、兼容性、设备权限及 Docker 硬件映射请参阅独立文档：

- [内置插件目录](docs/plugins/builtin/README.md)
- [Huawei iMana 200](docs/plugins/builtin/huawei-imana-200.md#简体中文)
- Mock：无需硬件，适合演示及模拟测试。

### 开机自启动

Web 后台「启动管理」显示已设置、未设置或未知。普通非 root 二进制及生产源码运行可在 systemd 用户管理器可用时一键启用（不立即启动第二个进程），权限不足时复制宿主机命令。Docker 显示未知并给出重启策略设置提示。参见[开机自启动指南](docs/autostart.md)。

独立二进制和生产源码启动时（alpha.8 起）自动生成数据目录下的 `setup-autostart.sh`。按启动日志或后台显示的路径，以原运行用户执行即可，例如 `sh /root/data/setup-autostart.sh`。脚本只启用开机自启，不启动重复进程；停止旧进程后按脚本提示启动 systemd 服务。

### systemd / 长期运行

下载已校验的二进制并获取仓库 deploy 目录：

```sh
sudo bash deploy/install.sh ./homeserver-fan-control-linux-x64-baseline
sudo systemctl status homeserver-fan-control
sudo journalctl -u homeserver-fan-control -f
```

通过 `sudo systemctl edit homeserver-fan-control` 添加覆盖配置：

```ini
[Service]
Environment=NITRO_PORT=8080
Environment=NITRO_HOST=127.0.0.1
```

保存后 `sudo systemctl restart homeserver-fan-control`。需要本地设备访问时，请参考所选插件文档配置最小权限。

### 在线更新

在 Web 后台的「软件更新」中选择稳定版或含预发行版通道，检查 GitHub Releases，并按部署类型下载匹配的发行附件。后台验证文件大小与 SHA-256，不会自动执行、替换程序或停止散热监控。

独立二进制可在终端检查更新：

```sh
./homeserver-fan-control-linux-x64-baseline --check-update
```

先停止原服务并备份数据，再使用原运行文件执行 `--update`（安装至系统目录时需有目录写权限）。新文件原子替换旧文件，旧版本保留为 `.previous`，请手动启动服务。若已有 `.previous`，请先移走保存，避免覆盖旧备份。Docker 从宿主机导入新镜像后用同一数据卷重建容器；源码部署重新构建。参见[在线更新指南](docs/updates.md)。

### 数据管理及升级

数据目录包含 database.sqlite、config.key、插件（旧版本还可能包含初始化密钥）。备份前停止进程或容器，完整备份数据目录（包括 SQLite WAL/SHM 如存在）；恢复时保留同一加密密钥及文件所有权。数据包含敏感信息，备份需受保护。更新时停止旧程序，替换二进制或镜像，重新启动；保留数据目录或 Docker 数据卷。卸载程序不等同于删除数据。

### 开发与构建

```sh
bun install --linker hoisted
bun run dev
bun run typecheck
bun run lint
bun run test
bun run build
bun run compile
bash scripts/smoke.sh
bash scripts/docker-smoke.sh
```

生产构建后还可以运行 `bun run start -- --port 8080` 或 `bun scripts/entry.ts --port 8080`。
开发服务器可直接使用 `bun --bun nuxt dev --host 127.0.0.1 --port 8080`。
GitHub Actions 验证 Nuxt 构建、单文件独立运行和 Docker 容器；版本发行附带校验文件。查看 [外部插件快速接入（推荐智能体阅读）](docs/plugins/external/quick-start.md)、[插件 SDK](docs/plugin-sdk.md)、[开发及安全验收状态](docs/refactor-status.md)。外置插件隔离尚未验收，不要启用不可信代码。

---

## English

HomeServer Fan Control is an open-source cooling-management project for home servers, studios and small offices. It combines a Nuxt/Vue SPA, persistent Nitro background scheduler, Bun and SQLite. Monitoring is independent of the browser; a shared plugin interface separates hardware transports from control policy.

**This is a public alpha safety preview, not a production-ready fan controller.** Physical hardware writes are currently disabled. Keep factory BMC cooling in AUTO. Only the Mock driver supports virtual adaptive control, timed leases and fallback.

### Features

- Web dashboard: instance management, current sensors, form-based policies (optional advanced JSON), history and events; English/Chinese and dark/light themes.
- Built-in and external hardware plugins with selectable transports. See the [built-in plugin directory](docs/plugins/builtin/README.md).
- SQLite WAL persistence, hashed administrator password and encrypted connection settings.
- Validated ZIP plugin installation and management; isolated execution is experimental and disabled by default.
- Linux x64 baseline standalone executable, Docker image, Compose and systemd.

### Quick start: standalone executable (recommended on bare-metal Linux / physical machines)

For older x86_64 CPUs (e.g. Ivy Bridge / Xeon E5 v2), use v0.3.0-alpha.4 or newer. Alpha.1–alpha.3 embed Bun 1.3.13, which produced an illegal-instruction crash on physical hardware. Alpha.4 uses Bun 1.4.5's unified x64 build while retaining the existing release asset name for download and updater compatibility.

Copy these commands on a Linux x86_64 machine to download, verify and start the application (requires curl, python3 and sha256sum). This selects a published release with all assets (including previews); see [Releases](https://github.com/censujiang/homeserver-fan-control/releases) for other versions. Prefer the managed bare-metal Linux server; VMs and other hosts can also use compatible remote plugins.

```sh
BASE=$(curl -fsSL 'https://api.github.com/repos/censujiang/homeserver-fan-control/releases?per_page=30' | python3 -c 'import json,sys; releases=json.load(sys.stdin); required={"homeserver-fan-control-linux-x64-baseline","homeserver-fan-control-docker-linux-amd64.tar.gz","SHA256SUMS"}; print(next("https://github.com/censujiang/homeserver-fan-control/releases/download/"+r["tag_name"] for r in releases if not r["draft"] and required <= {a["name"] for a in r["assets"] if a["state"]=="uploaded"}))') && \
curl -fL --connect-timeout 15 --retry 3 "$BASE/homeserver-fan-control-linux-x64-baseline" -o homeserver-fan-control-linux-x64-baseline && \
curl -fL --connect-timeout 15 --max-time 60 --retry 3 "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-linux-x64-baseline$' SHA256SUMS | sha256sum -c - && \
chmod +x homeserver-fan-control-linux-x64-baseline && \
./homeserver-fan-control-linux-x64-baseline --port 8080
```

From alpha.6, open http://127.0.0.1:8080 and create/confirm an administrator password (12–128 characters); no setup key is required. Use `ssh -L 8080:127.0.0.1:8080 user@server` for remote access. Alpha.5 and older require the legacy key (`cat ./data/setup-token; echo`). No separate Bun or Node.js installation is required.

**Keep running after SSH disconnect (Debian/Ubuntu/PVE):** stop any existing foreground process first.

```sh
sudo apt-get install -y screen
screen -dmS hsfc ./homeserver-fan-control-linux-x64-baseline --port 8080 --data-dir ./data
screen -ls
```

Use `screen -r hsfc` to attach and Ctrl+A then D to detach. Screen normally survives SSH disconnect but not reboot; use systemd for long-term operation. For first-time direct LAN access, restrict network access to the administrator and temporarily add `--host 0.0.0.0 --allow-remote-setup`. Remove the setup option after creating the administrator.

### Command-line options and environment variables

| Option | Environment variables (precedence order) | Default |
|---|---|---|
| `-p` / `--port` | `NITRO_PORT` / `PORT` | 3000 |
| `-H` / `--host` | `NITRO_HOST` / `HOST` | 127.0.0.1 |
| `--data-dir` | `HSFC_DATA_DIR` | ./data |
| `--allow-remote-setup` | `HSFC_ALLOW_REMOTE_SETUP=1` | off / 关闭 |
| `-h` / `--help` | — | Help |

CLI options override environment variables. Ports must be integers between 1 and 65535. Low ports may require extra OS permissions.

```sh
./homeserver-fan-control-linux-x64-baseline --host 0.0.0.0 --port 18080 --data-dir ./hsfc-data
PORT=18080 ./homeserver-fan-control-linux-x64-baseline
```

Use a firewall and an HTTPS reverse proxy before exposing the service beyond loopback. Do not expose an unencrypted management UI directly to the public Internet.

### Docker (Linux amd64)

**Option A: load the published image archive.** Copy the following commands to download, verify and load the release image (requires curl, python3 and sha256sum).

```sh
BASE=$(curl -fsSL 'https://api.github.com/repos/censujiang/homeserver-fan-control/releases?per_page=30' | python3 -c 'import json,sys; releases=json.load(sys.stdin); required={"homeserver-fan-control-linux-x64-baseline","homeserver-fan-control-docker-linux-amd64.tar.gz","SHA256SUMS"}; print(next("https://github.com/censujiang/homeserver-fan-control/releases/download/"+r["tag_name"] for r in releases if not r["draft"] and required <= {a["name"] for a in r["assets"] if a["state"]=="uploaded"}))') && \
curl -fL --connect-timeout 15 --retry 3 "$BASE/homeserver-fan-control-docker-linux-amd64.tar.gz" -o homeserver-fan-control-docker-linux-amd64.tar.gz && \
curl -fL --connect-timeout 15 --max-time 60 --retry 3 "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-docker-linux-amd64.tar.gz$' SHA256SUMS | sha256sum -c - && \
docker load -i homeserver-fan-control-docker-linux-amd64.tar.gz && \
docker run -d --name hsfc --restart unless-stopped \
  -p 127.0.0.1:8080:3000 -v hsfc-data:/data -e HSFC_ALLOW_REMOTE_SETUP=1 \
  --security-opt no-new-privileges:true homeserver-fan-control:ci
```

The host port is 8080; the container port is 3000. For alpha.6+, create the administrator via the loopback-published UI. HSFC_ALLOW_REMOTE_SETUP=1 is only for first setup; recreate the container without it after setup, keeping the data volume. To change the internal port as well:

```sh
docker run -d --name hsfc-custom \
  -p 127.0.0.1:18080:9000 -v hsfc-custom-data:/data -e HSFC_ALLOW_REMOTE_SETUP=1 \
  homeserver-fan-control:ci --port 9000
```

The container binds 0.0.0.0 internally and runs as UID/GID 10001, not root. For LAN access, change the host port mapping deliberately and configure access controls.

**Option B: build from source with Docker Compose.**

```sh
git clone https://github.com/censujiang/homeserver-fan-control.git
cd homeserver-fan-control
HSFC_ALLOW_REMOTE_SETUP=1 HSFC_HOST_PORT=8080 docker compose up -d --build
docker compose logs -f
```

Set HSFC_HOST_PORT to change the published host port. To change the internal port use `command: ["--port", "9000"]` and update the target port in ports. Keep the named volume; `docker compose down -v` deletes it.

### Built-in plugins and hardware setup

Choose the plugin for your hardware. See its dedicated guide for connection settings, compatibility, device permissions and Docker hardware mapping.

- [Built-in plugin directory](docs/plugins/builtin/README.md)
- [Huawei iMana 200](docs/plugins/builtin/huawei-imana-200.md#english)
- Mock: no hardware required; intended for demonstrations and simulation.

### Boot startup

The Startup page reports enabled, disabled or unknown. Non-root standalone and production source deployments can enable a systemd user service when available, without starting a duplicate process. If permission is missing, copy the host commands. Docker reports unknown and provides restart-policy instructions. See the [startup guide](docs/autostart.md).

Since alpha.8, standalone and production source launches generate `setup-autostart.sh` in the data directory. Run it as the original application user, e.g. `sh /root/data/setup-autostart.sh`. It enables boot startup without launching a duplicate instance; stop the old process before starting the service.

### systemd

```sh
sudo bash deploy/install.sh ./homeserver-fan-control-linux-x64-baseline
sudo systemctl status homeserver-fan-control
sudo journalctl -u homeserver-fan-control -f
```

Change settings via `sudo systemctl edit homeserver-fan-control`:

```ini
[Service]
Environment=NITRO_PORT=8080
Environment=NITRO_HOST=127.0.0.1
```

Restart the service. Grant local device access separately, following the selected plugin documentation.

### Online updates

Open Software updates in the Web UI, select the stable or preview channel, check GitHub Releases and download the matching deployment asset. The server verifies its size and SHA-256. It does not execute the download, replace the running application or stop cooling monitoring automatically.

```sh
./homeserver-fan-control-linux-x64-baseline --check-update
```

Stop the service and back up data first, then run the current binary with `--update` (write permission to its directory is required). The binary is atomically replaced and the old executable retained as `.previous`; restart manually. Move an existing backup away before updating again. Docker deployments load the new image on the host and recreate the container with the same data volume; source deployments rebuild. See the [update guide](docs/updates.md).

### Persistence, backup and upgrade

Stop the application before backing up its entire data directory, including database.sqlite, any WAL/SHM files, config.key and plugins. Keep the matching encryption key and ownership; protect backups as sensitive data. Upgrade by stopping the old application, replacing the binary or image, and restarting with the same data directory/volume. Uninstalling the service should not delete user data.

### Development and testing

```sh
bun install --linker hoisted
bun run dev
bun run typecheck
bun run lint
bun run test
bun run build
bun run compile
bash scripts/smoke.sh
bash scripts/docker-smoke.sh
```

After a production build, use `bun run start -- --port 8080` or `bun scripts/entry.ts --port 8080`.
For development: `bun --bun nuxt dev --host 127.0.0.1 --port 8080`.
CI builds and verifies the standalone executable and Docker image before publishing checksummed assets.
See the [external plugin quick start (agent-friendly)](docs/plugins/external/quick-start.md), [plugin SDK](docs/plugin-sdk.md) and [implementation status and safety gates](docs/refactor-status.md).
Do not enable unverified third-party code.

## License

[MIT](LICENSE)
