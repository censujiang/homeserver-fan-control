# HomeServer Fan Control

[简体中文](#简体中文) | [English](#english)

[![Build and verify](https://github.com/censujiang/homeserver-fan-control/actions/workflows/ci.yml/badge.svg)](https://github.com/censujiang/homeserver-fan-control/actions/workflows/ci.yml)
[![MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 简体中文

面向家庭服务器、个人工作室及小型办公室的服务器智能散热管理项目。采用 Nuxt + Vue SPA、Nitro 后台任务、Bun 与 SQLite；浏览器关闭后监控仍独立运行。硬件驱动与温控策略通过统一插件接口解耦。

**当前版本为公开 Alpha 安全预览，并非生产级风扇控制器。** Huawei iMana 200 的 SSH、本地 IPMI 驱动不执行真实硬件写入；真实 ADAPTIVE 暂不可启用。请维持 BMC 原厂 AUTO。Mock 驱动可模拟自适应调速、有限手动租约和故障回退。

### 功能

- Web 管理后台：服务器管理、实时传感器状态、温控策略 JSON、历史采样、异常事件、中英文及亮暗主题。
- iMana 200：远程 SSH 持久化交互式 Shell；本地 Linux OpenIPMI。
- SQLite WAL 持久化、管理员密码哈希、连接配置加密。
- 外置 ZIP 插件安装、校验及管理；隔离执行是实验功能，默认关闭。
- Linux x86_64 baseline 单文件、Docker 镜像、Compose、systemd。

### 快速开始：独立二进制（推荐 PVE 宿主机）

从 [Releases](https://github.com/censujiang/homeserver-fan-control/releases) 下载
`homeserver-fan-control-linux-x64-baseline` 和 `SHA256SUMS`，将它们放在同一目录。
仅下载一个发行文件时可使用：

```sh
grep '  homeserver-fan-control-linux-x64-baseline$' SHA256SUMS | sha256sum -c -
chmod +x homeserver-fan-control-linux-x64-baseline
./homeserver-fan-control-linux-x64-baseline --port 8080
```

默认只监听 127.0.0.1:3000。上例为 127.0.0.1:8080，无需安装 Bun、Node.js 或 npm。
初次运行在数据目录（默认 `./data`）创建 `setup-token`。在运行用户下读取：

```sh
cat ./data/setup-token
```

通过本机浏览器或 SSH 端口转发访问 Web 界面，输入初始化密钥并设置至少 12 字符的密码。初始化完成后密钥文件会被删除。

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

下载 Release 的 `homeserver-fan-control-docker-linux-amd64.tar.gz` 与 `SHA256SUMS`。

```sh
grep '  homeserver-fan-control-docker-linux-amd64.tar.gz$' SHA256SUMS | sha256sum -c -
docker load -i homeserver-fan-control-docker-linux-amd64.tar.gz
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

### 接入 Huawei iMana 200

| 方式 | 适用场景 | 所需条件 |
|---|---|---|
| SSH | 远程设备、PVE 虚拟机、容器 | BMC 管理 IP、端口、用户名、密码或私钥、已独立核验的 SHA256 主机公钥指纹 |
| Local IPMI | 被管理服务器的物理 Linux 宿主机 | /dev/ipmi0、/usr/bin/ipmitool、访问设备的最小权限 |
| Mock | 无实机测试、演示 | 无硬件依赖 |

SSH 不依赖本地 IPMI，也不需要 root。通过可靠渠道核验主机公钥指纹，不要盲目信任首次连接的指纹。

本地 IPMI 示例（只读）：

```sh
ls -l /dev/ipmi0
ipmitool -I open mc info
ipmitool -I open sensor list
stat -c '%g' /dev/ipmi0
```

容器方式需要额外映射真实设备并授予对应数字 GID，如：

```sh
docker run -d --name hsfc-ipmi \
  --device /dev/ipmi0:/dev/ipmi0 \
  --group-add "$(stat -c '%g' /dev/ipmi0)" \
  -p 127.0.0.1:8080:3000 -v hsfc-ipmi-data:/data \
  homeserver-fan-control:ci
```

设备权限需允许该组读写设备（IPMI 通信本身使用设备双向接口，即使应用不发控制写指令）。如果设备只允许 root 访问，请通过宿主机的适当设备权限规则配置专用组，不要使用 --privileged，也不要将设备开放给所有用户。PVE 虚拟机默认不拥有物理 BMC 设备，建议使用 SSH。

目前实际 iMana 200 SSH 协议解析、身份/健康验证及持续控制租约仍需实机验收。本地 OEM 写入指令尚未验证。目标老款 Xeon 也需实测。

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

保存后 `sudo systemctl restart homeserver-fan-control`。需要访问 IPMI 时单独配置设备组权限。

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
GitHub Actions 验证 Nuxt 构建、单文件独立运行和 Docker 容器；版本发行附带校验文件。查看 [插件 SDK](docs/plugin-sdk.md)、[开发及安全验收状态](docs/refactor-status.md)。外置插件隔离尚未验收，不要启用不可信代码。

---

## English

HomeServer Fan Control is an open-source cooling-management project for home servers, studios and small offices. It combines a Nuxt/Vue SPA, persistent Nitro background scheduler, Bun and SQLite. Monitoring is independent of the browser; a shared plugin interface separates hardware transports from control policy.

**This is a public alpha safety preview, not a production-ready fan controller.** Physical Huawei iMana 200 fan writes are disabled in both SSH and local IPMI modes. Keep factory BMC cooling in AUTO. Only the Mock driver supports virtual adaptive control, timed leases and fallback.

### Features

- Web dashboard: instance management, current sensors, JSON policies, history and events; English/Chinese and dark/light themes.
- iMana 200 interactive SSH transport and Linux OpenIPMI transport.
- SQLite WAL persistence, hashed administrator password and encrypted connection settings.
- Validated ZIP plugin installation and management; isolated execution is experimental and disabled by default.
- Linux x64 baseline standalone executable, Docker image, Compose and systemd.

### Standalone executable (recommended on the physical PVE host)

Download `homeserver-fan-control-linux-x64-baseline` and `SHA256SUMS` from [Releases](https://github.com/censujiang/homeserver-fan-control/releases).

```sh
grep '  homeserver-fan-control-linux-x64-baseline$' SHA256SUMS | sha256sum -c -
chmod +x homeserver-fan-control-linux-x64-baseline
./homeserver-fan-control-linux-x64-baseline --port 8080
cat ./data/setup-token
```

No Bun, Node.js, npm or separate front-end assets are required. The default binding is 127.0.0.1:3000; this example uses port 8080. Read the first-run setup token from the data directory and open the Web UI locally or via SSH port forwarding. Choose an administrator password of at least 12 characters. The setup token is removed after initialization.

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

**Option A: load the published image archive.** Download the Docker archive and checksum file from Releases.

```sh
grep '  homeserver-fan-control-docker-linux-amd64.tar.gz$' SHA256SUMS | sha256sum -c -
docker load -i homeserver-fan-control-docker-linux-amd64.tar.gz
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

### Hardware transports

| Transport | Use case | Requirements |
|---|---|---|
| SSH | Remote BMC, VM, container | BMC address, port, credentials and independently verified SHA256 host-key fingerprint |
| Local IPMI | Physical Linux host | /dev/ipmi0, /usr/bin/ipmitool, restricted device access |
| Mock | Demonstration and testing | No hardware dependencies |

SSH does not require local IPMI or root. Verify the fingerprint via a trusted channel, not merely the first SSH connection.

For read-only local IPMI, check `ipmitool -I open mc info` and `ipmitool -I open sensor list`. In Docker, explicitly map the device and its numeric group:

```sh
docker run -d --name hsfc-ipmi \
  --device /dev/ipmi0:/dev/ipmi0 \
  --group-add "$(stat -c '%g' /dev/ipmi0)" \
  -p 127.0.0.1:8080:3000 -v hsfc-ipmi-data:/data \
  homeserver-fan-control:ci
```

Ensure the group has appropriate device permissions via a restricted host rule. Do not run the container privileged or grant world access to the device. A PVE VM normally cannot access the physical BMC device; prefer SSH. Exact SSH parsing and identity/health checks, repeated hardware leases, local OEM writes and target Xeon compatibility still require hardware validation.

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

Restart the service. Grant local device access separately, only when needed.

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
See the [plugin SDK](docs/plugin-sdk.md) and [implementation status and safety gates](docs/refactor-status.md).
Do not enable unverified third-party code.

## License

[MIT](LICENSE)
