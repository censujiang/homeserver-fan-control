# 开机自启动 / Boot startup

## 简体中文

Web 后台「启动管理」展示已设置、未设置或未知，检测当前 systemd 服务 MainPID 与永久启用状态；用户服务还检查 linger。未找到匹配服务不等于不存在 cron、其他 init 或厂商启动任务。Docker 容器不能可靠获取宿主机的重启策略，因此显示未知。

### SSH 断开后继续运行（Screen）

先停止当前前台进程（Ctrl+C），在原目录使用原运行用户执行：

```sh
sudo apt-get install -y screen
screen -dmS hsfc ./homeserver-fan-control-linux-x64-baseline --port 8080 --data-dir ./data
screen -ls
screen -r hsfc
```

Ctrl+A 后 D 分离会话。Screen 通常可跨 SSH 断线持续运行，但不能跨系统重启；部分系统登录会话回收策略也可能终止它，长期运行优先 systemd。不要重复启动相同数据目录。按实际配置调整端口和目录。alpha.6 首次本机或 SSH 隧道初始化只需密码；直接局域网首次初始化需临时添加 --host 0.0.0.0 --allow-remote-setup，并限制访问，完成后移除该选项。

### 非 root 独立二进制 / 生产源码

若 Linux systemd 用户管理器可用，点击「一键设置开机自启」。程序只写当前用户的专属 unit，并保留当前可执行路径、工作目录、监听地址、端口、绝对数据目录。以数据目录哈希区分实例，不覆盖同名不同配置的 unit，不会立即启动第二个进程。用户服务需要 linger 才能在未登录时开机启动；如果系统需要管理员授权，使用页面复制的命令：

```sh
sudo loginctl enable-linger "$(id -u)"
./homeserver-fan-control-linux-x64-baseline --enable-autostart --port 8080 --data-dir ./data
./homeserver-fan-control-linux-x64-baseline --autostart-status --port 8080 --data-dir ./data
```

源码生产构建：

```sh
bun run build
bun scripts/entry.ts --enable-autostart --port 8080 --data-dir ./data
```

在原部署目录、以同一非 root 用户执行，保持参数与当前实例一致。开发服务器及直接 Nitro 内部入口不受自动安装支持。系统未运行 systemd 或没有用户管理器时，需要使用宿主机自己的服务管理方式。

如果需要立即切换到服务，先停止手动运行的实例，再执行页面显示 unit 对应的 `systemctl --user start <unit>`。检查 `systemctl --user status <unit>`。禁用可用 `systemctl --user disable <unit>`；停止服务需显式操作。不要同时启动两个使用同一数据目录的实例。代理等自定义环境变量、IPMI 设备组及额外权限需要自行在服务环境中配置。

### 自动生成本地自启脚本（alpha.8+）

独立二进制和生产源码入口启动时，自动在当前数据目录生成 `setup-autostart.sh`，启动日志和管理后台「启动管理」显示实际路径。脚本保留当前可执行文件、工作目录、监听地址、端口和数据目录，不保存初始化授权选项，不要求手工填写 unit。以原运行用户执行（不要对普通用户生成的脚本使用 sudo）：

```sh
sh /root/data/setup-autostart.sh
```

上例适用于数据目录为 /root/data 的 root 运行实例；普通用户使用自己数据目录下的脚本。也可以在程序停止时按原运行参数重新生成：

```sh
./homeserver-fan-control-linux-x64-baseline --generate-autostart-script --host 0.0.0.0 --port 9001 --data-dir /root/data
```

脚本只安装/启用开机自启，不会启动第二个进程。停止当前前台/Screen 进程后，再按脚本输出的命令启动服务。root 实例默认使用 homeserver-fan-control.service，保留当前 root 权限；长期建议专用非 root 账户。已存在且内容不同的 unit 不会覆盖；已经在 systemd 下运行时则仅启用当前服务。普通用户设置自己的 systemd 服务并检查 linger，授权不足时在宿主机完成授权。Docker 不生成脚本。

### 系统级 systemd / root 直接运行

现有系统级服务可由页面检测，若未启用，在宿主机执行页面给出的 `sudo systemctl enable <unit>`（不自动 start）。Web 不执行 sudo 或安装 root 服务。

直接以 root 启动时，Web 不会自动安装系统级服务；可执行前述本地脚本保留现有权限。建议先备份数据、停止当前程序，迁移到专用非 root 用户及持久化目录。参考仓库 deploy/install.sh、deploy/homeserver-fan-control.service；安装脚本默认使用 /usr/local/bin/homeserver-fan-control、/var/lib/homeserver-fan-control、127.0.0.1:3000，并会立即启用/启动。已有数据必须先安排迁移与归属、配置端口及设备权限，再启动，不能直接覆盖或并行运行。也可以通过 `sudo systemctl edit --force --full homeserver-fan-control.service` 手工创建服务，参考模板配置 User、Group、WorkingDirectory、ExecStart、数据目录和端口，再 `sudo systemctl enable homeserver-fan-control.service`。确认配置后手动 start。

### Docker

在宿主机执行（将 CONTAINER 替换为实际容器名称）：

```sh
docker inspect --format '{{.HostConfig.RestartPolicy.Name}}' CONTAINER
docker update --restart unless-stopped CONTAINER
sudo systemctl enable docker
```

最后一条只适用于 systemd 管理的普通 Docker Engine；rootless Docker、NAS 与其他系统需遵循其管理方式。Compose 已包含 restart: unless-stopped；Docker 自身也须随宿主机启动。手动停止的 unless-stopped 容器不会自动恢复。不要为了查询重启策略把 Docker Socket 挂进 Web 容器。

## English

The Startup page reports enabled, disabled or unknown. It checks the current systemd MainPID and persistent enablement; user services also require linger. Missing matching units do not rule out cron or other service managers. Docker reports unknown because the container cannot reliably inspect the host restart policy.

For temporary background operation, stop any existing process, install Screen and run `screen -dmS hsfc ./homeserver-fan-control-linux-x64-baseline --port 8080 --data-dir ./data` from the original directory. Use `screen -ls`, `screen -r hsfc` and Ctrl+A then D to detach. Screen normally survives SSH disconnect but not reboot; systemd is preferred for long-term operation. Some session cleanup policies may terminate Screen. For alpha.6+, password-only first setup is allowed on loopback or via an SSH tunnel; trusted LAN setup requires the temporary --allow-remote-setup option, restricted access and removal after setup.

For a non-root standalone binary or production source deployment, enable startup in the Web UI when a user systemd manager is available. The generated user unit preserves executable, working directory, host, port and absolute data directory, has a per-data-directory identifier, refuses conflicts and does not start a second process. Linger may require host authorization; run the copied commands in the same user's login session, using the original deployment directory and parameters.

```sh
sudo loginctl enable-linger "$(id -u)"
./homeserver-fan-control-linux-x64-baseline --enable-autostart --port 8080 --data-dir ./data
./homeserver-fan-control-linux-x64-baseline --autostart-status --port 8080 --data-dir ./data
# Source deployment, after bun run build:
bun scripts/entry.ts --enable-autostart --port 8080 --data-dir ./data
```

Development servers and direct Nitro internal entry points are not supported for automatic installation. Stop the manually running process before starting the generated unit using systemctl --user start UNIT. Use status/disable as needed. Preserve additional proxy environment and device-group settings manually. Never run two instances against the same data directory.

Existing system-level units may be detected and enabled on the host using sudo systemctl enable UNIT. The Web process never runs sudo or installs a root service. Since alpha.8, standalone/production source launches generate setup-autostart.sh in the data directory. Run it as the original account (never sudo a user-generated script). It enables the service without starting a second process, preserves paths and port, and refuses conflicting units. Root launches preserve root privileges; use a dedicated account long-term. Docker does not generate the script. Use --generate-autostart-script with the original launch options to regenerate it. For a directly root-run process, back up and stop it, migrate data to a dedicated non-root service and configure the provided deploy template before starting. The install script uses /usr/local/bin/homeserver-fan-control, /var/lib/homeserver-fan-control and port 3000, and starts immediately; prepare migration and configuration first. Alternatively create the system unit manually with sudo systemctl edit --force --full homeserver-fan-control.service and set User, Group, WorkingDirectory, ExecStart, data and port, then enable and start explicitly.

Docker: run docker inspect and docker update --restart unless-stopped CONTAINER on the host; Compose already uses that restart policy. Enable Docker Engine at boot if appropriate (sudo systemctl enable docker on systemd hosts; rootless/NAS deployments differ). Manually stopped unless-stopped containers remain stopped. Do not mount the Docker socket.

[Project README](../README.md)
