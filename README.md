# HomeServer Fan Control

[简体中文](#简体中文) | [English](#english)

[![Build and verify](https://github.com/censujiang/homeserver-fan-control/actions/workflows/ci.yml/badge.svg)](https://github.com/censujiang/homeserver-fan-control/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 简体中文

面向家庭服务器、个人工作室及小型办公室的服务器智能散热管理项目。采用 Nuxt + Vue SPA、Nitro 后台任务、Bun 与 SQLite；浏览器关闭后监控仍独立运行。硬件驱动与温控策略通过统一插件接口解耦。

**当前版本为公开 Alpha 安全预览，并非生产级风扇控制器。** 当前物理硬件驱动不执行真实写入；真实 ADAPTIVE 暂不可启用。请维持 BMC 原厂 AUTO。Mock 驱动可模拟自适应调速、有限手动租约和故障回退。

### 功能

- Web 管理后台：服务器管理、实时传感器状态、温控策略 JSON、历史采样、异常事件、中英文及亮暗主题。
- 内置与外置硬件插件，支持按插件选择连接方式。参见[内置插件目录](docs/plugins/builtin/README.md)。
- SQLite WAL 持久化、管理员密码哈希、连接配置加密。
- 外置 ZIP 插件安装、校验及管理；隔离执行是实验功能，默认关闭。
- Linux x86_64 baseline 单文件、Docker 镜像、Compose、systemd。

### 快速开始：独立二进制（推荐 Linux 裸金属 / 物理机）

在 Linux x86_64 物理机上复制以下命令即可下载、校验并启动（需要 curl 和 sha256sum）。当前示例使用公开版本 v0.3.0-alpha.3，其他版本请查看 [Releases](https://github.com/censujiang/homeserver-fan-control/releases)。建议优先在被管理的裸金属 Linux 服务器运行；虚拟机或其他主机也可使用兼容的远程插件。

```sh
BASE=https://github.com/censujiang/homeserver-fan-control/releases/download/v0.3.0-alpha.3
curl -fL "$BASE/homeserver-fan-control-linux-x64-baseline" -o homeserver-fan-control-linux-x64-baseline && \
curl -fL "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-linux-x64-baseline$' SHA256SUMS | sha256sum -c - && \
chmod +x homeserver-fan-control-linux-x64-baseline && \
./homeserver-fan-control-linux-x64-baseline --port 8080
```

默认只监听 127.0.0.1:3000。上例为 127.0.0.1:8080，无需安装 Bun、Node.js 或 npm。
初次运行在数据目录（默认 `./data`）创建 `setup-token`。在第二个终端以同一运行用户读取：

```sh
cat ./data/setup-token
```

打开 http://127.0.0.1:8080（远程服务器可先运行 `ssh -L 8080:127.0.0.1:8080 user@server` 建立隧道），输入初始化密钥并设置至少 12 字符的密码。初始化完成后密钥文件会被删除。

### 启动参数与环境变量

| 参数 | 环境变量（按优先级） | 默认值 |
|---|---|---|
| `-p` / `--port` | `NITRO_PORT` / `PORT` | 3000 |
| `-H` / `--host` | `NITRO_HOST` / `HOST` | 127.0.0.1 |
| `--data-dir` | `HSFC_DATA_DIR` | ./data |
| `-h` / `--help` | — | 显示帮助 |

命令行优先于环境变量，端口必须为 1–65535 的整数。普通用户监听 1024 以下端口可能需要额外权限。

```sh
./homeserver-fan-control-linux-x64-baseline --host 0.0.0.0 --port 18080 --data-dir ./hsfc-data
PORT=18080 ./homeserver-fan-control-linux-x64-baseline
```

开放局域网前请配置防火墙与 HTTPS 反向代理。不要将 HTTP 管理后台直接暴露至公网。

### Docker 部署（Linux amd64）

**方式 A：下载已构建的发行镜像，不需要源码。**

复制以下命令下载发行镜像、校验并导入：

```sh
BASE=https://github.com/censujiang/homeserver-fan-control/releases/download/v0.3.0-alpha.3
curl -fL "$BASE/homeserver-fan-control-docker-linux-amd64.tar.gz" -o homeserver-fan-control-docker-linux-amd64.tar.gz && \
curl -fL "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-docker-linux-amd64.tar.gz$' SHA256SUMS | sha256sum -c - && \
docker load -i homeserver-fan-control-docker-linux-amd64.tar.gz && \
docker run -d --name hsfc --restart unless-stopped \
  -p 127.0.0.1:8080:3000 \
  -v hsfc-data:/data \
  --security-opt no-new-privileges:true \
  homeserver-fan-control:ci
docker exec hsfc cat /data/setup-token
```

宿主机访问 8080，容器内部监听 3000。也支持直接改变容器内部端口：

```sh
docker run -d --name hsfc-custom \
  -p 127.0.0.1:18080:9000 -v hsfc-custom-data:/data \
  homeserver-fan-control:ci --port 9000
```

容器默认监听 0.0.0.0，使用 UID/GID 10001 的非 root 用户。端口映射默认仅绑定宿主机回环地址。要开放局域网，可以把映射改成 `-p 8080:3000`，并做好网络访问控制。

**方式 B：从源码构建和运行 Compose。**

```sh
git clone https://github.com/censujiang/homeserver-fan-control.git
cd homeserver-fan-control
HSFC_HOST_PORT=8080 docker compose up -d --build
docker compose exec fan-control cat /data/setup-token
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

### systemd / 长期运行

下载已校验的二进制并获取仓库 deploy 目录：

```sh
sudo bash deploy/install.sh ./homeserver-fan-control-linux-x64-baseline
sudo systemctl status homeserver-fan-control
sudo journalctl -u homeserver-fan-control -f
sudo cat /var/lib/homeserver-fan-control/setup-token
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

数据目录包含 database.sqlite、config.key、插件及初始化密钥（初始化前）。备份前停止进程或容器，完整备份数据目录（包括 SQLite WAL/SHM 如存在）；恢复时保留同一加密密钥及文件所有权。数据包含敏感信息，备份需受保护。更新时停止旧程序，替换二进制或镜像，重新启动；保留数据目录或 Docker 数据卷。卸载程序不等同于删除数据。

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

- Web dashboard: instance management, current sensors, JSON policies, history and events; English/Chinese and dark/light themes.
- Built-in and external hardware plugins with selectable transports. See the [built-in plugin directory](docs/plugins/builtin/README.md).
- SQLite WAL persistence, hashed administrator password and encrypted connection settings.
- Validated ZIP plugin installation and management; isolated execution is experimental and disabled by default.
- Linux x64 baseline standalone executable, Docker image, Compose and systemd.

### Quick start: standalone executable (recommended on bare-metal Linux / physical machines)

Copy these commands on a Linux x86_64 machine to download, verify and start the application (requires curl and sha256sum). The example uses public release v0.3.0-alpha.3; see [Releases](https://github.com/censujiang/homeserver-fan-control/releases) for other versions. Prefer the managed bare-metal Linux server; VMs and other hosts can also use compatible remote plugins.

```sh
BASE=https://github.com/censujiang/homeserver-fan-control/releases/download/v0.3.0-alpha.3
curl -fL "$BASE/homeserver-fan-control-linux-x64-baseline" -o homeserver-fan-control-linux-x64-baseline && \
curl -fL "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-linux-x64-baseline$' SHA256SUMS | sha256sum -c - && \
chmod +x homeserver-fan-control-linux-x64-baseline && \
./homeserver-fan-control-linux-x64-baseline --port 8080
```

In a second terminal (as the same user):

```sh
cat ./data/setup-token
```

No Bun, Node.js, npm or separate front-end assets are required. The default binding is 127.0.0.1:3000; this example uses port 8080. Read the first-run setup token and open http://127.0.0.1:8080. For a remote server, first use `ssh -L 8080:127.0.0.1:8080 user@server`. Choose an administrator password of at least 12 characters. The setup token is removed after initialization.

### Command-line options and environment variables

| Option | Environment variables (precedence order) | Default |
|---|---|---|
| `-p` / `--port` | `NITRO_PORT` / `PORT` | 3000 |
| `-H` / `--host` | `NITRO_HOST` / `HOST` | 127.0.0.1 |
| `--data-dir` | `HSFC_DATA_DIR` | ./data |
| `-h` / `--help` | — | Help |

CLI options override environment variables. Ports must be integers between 1 and 65535. Low ports may require extra OS permissions.

```sh
./homeserver-fan-control-linux-x64-baseline --host 0.0.0.0 --port 18080 --data-dir ./hsfc-data
PORT=18080 ./homeserver-fan-control-linux-x64-baseline
```

Use a firewall and an HTTPS reverse proxy before exposing the service beyond loopback. Do not expose an unencrypted management UI directly to the public Internet.

### Docker (Linux amd64)

**Option A: load the published image archive.** Copy the following commands to download, verify and load the release image.

```sh
BASE=https://github.com/censujiang/homeserver-fan-control/releases/download/v0.3.0-alpha.3
curl -fL "$BASE/homeserver-fan-control-docker-linux-amd64.tar.gz" -o homeserver-fan-control-docker-linux-amd64.tar.gz && \
curl -fL "$BASE/SHA256SUMS" -o SHA256SUMS && \
grep '  homeserver-fan-control-docker-linux-amd64.tar.gz$' SHA256SUMS | sha256sum -c - && \
docker load -i homeserver-fan-control-docker-linux-amd64.tar.gz && \
docker run -d --name hsfc --restart unless-stopped \
  -p 127.0.0.1:8080:3000 -v hsfc-data:/data \
  --security-opt no-new-privileges:true homeserver-fan-control:ci
docker exec hsfc cat /data/setup-token
```

The host port is 8080; the container port is 3000. To change the internal port as well:

```sh
docker run -d --name hsfc-custom \
  -p 127.0.0.1:18080:9000 -v hsfc-custom-data:/data \
  homeserver-fan-control:ci --port 9000
```

The container binds 0.0.0.0 internally and runs as UID/GID 10001, not root. For LAN access, change the host port mapping deliberately and configure access controls.

**Option B: build from source with Docker Compose.**

```sh
git clone https://github.com/censujiang/homeserver-fan-control.git
cd homeserver-fan-control
HSFC_HOST_PORT=8080 docker compose up -d --build
docker compose exec fan-control cat /data/setup-token
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

### systemd

```sh
sudo bash deploy/install.sh ./homeserver-fan-control-linux-x64-baseline
sudo systemctl status homeserver-fan-control
sudo journalctl -u homeserver-fan-control -f
sudo cat /var/lib/homeserver-fan-control/setup-token
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
