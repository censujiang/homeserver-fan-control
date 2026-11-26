# Huawei iMana 200

[简体中文](#简体中文) | [English](#english) | [内置插件 / Built-in plugins](README.md) | [项目 / Project](../../../README.md)

## 简体中文

内置插件 ID：`huawei.imana200`。无需额外安装插件，在 Web 后台添加服务器时选择 Huawei iMana 200，再选择 SSH 或 Local IPMI。

**当前为只读安全预览。** 两种连接方式均禁止实际风扇写入，请保持 BMC 原厂 AUTO。

### 连接方式与部署

| 方式 | 适用场景 | 所需条件 |
|---|---|---|
| SSH | 远程设备、PVE 虚拟机、容器 | BMC 管理 IP、端口、用户名、密码或私钥、已独立核验的 SHA256 主机公钥指纹 |
| Local IPMI | 被管理服务器的物理 Linux 宿主机 | /dev/ipmi0、/usr/bin/ipmitool、访问设备的最小权限 |

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


### Web 配置

SSH 模式填写管理 IP/主机名、SSH 端口（默认 22）、用户名、密码或私钥（二选一）、已核验的 SHA256 主机公钥指纹及超时（默认 10000 ms）。使用交互式 Shell，不依赖 SSH Exec。旧设备协议兼容性需实测，不要降低系统全局 SSH 安全策略。

Local IPMI 模式配置设备 `/dev/ipmi0` 及超时（默认 12000 ms），当前使用 `/usr/bin/ipmitool`，无需 BMC 管理网络或 SSH 凭据。推荐在被管理的裸金属 Linux 物理机运行。选择 MONITOR；DRY_RUN 仅模拟，真实 ADAPTIVE 尚未开放。

### 已知限制

文档记录的实机环境为 iMana 200 固件 7.38、厂商 ID 2011、产品 ID 0xAA81。旧款硬件曾验证读取及 SSH 有限手动模式，但新版驱动的输出解析、身份识别、健康状态及连续租约仍需重新实机验收。请勿尝试未经验证的 OEM 写入指令。更多见[安全验收状态](../../refactor-status.md)。

## English

Built-in plugin ID: `huawei.imana200`. No additional installation is needed. Add a server in the Web UI, select Huawei iMana 200, then SSH or Local IPMI.

**Read-only safety preview.** Neither transport performs physical fan writes. Keep factory BMC cooling in AUTO.

### Transports and deployment

| Transport | Use case | Requirements |
|---|---|---|
| SSH | Remote BMC, VM, container | BMC address, port, credentials and independently verified SHA256 host-key fingerprint |
| Local IPMI | Physical Linux host | /dev/ipmi0, /usr/bin/ipmitool, restricted device access |

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


### Web configuration

For SSH, enter the management host, SSH port (default 22), username, either a password or a private key, the independently verified SHA256 host-key fingerprint, and timeout (default 10000 ms). The driver uses an interactive shell rather than SSH Exec. Legacy protocol compatibility needs hardware verification; do not weaken global SSH security settings.

For Local IPMI, configure `/dev/ipmi0` and timeout (default 12000 ms). The current driver uses `/usr/bin/ipmitool`, with no management network or SSH credentials required. Prefer the managed bare-metal Linux machine. Select MONITOR; DRY_RUN is simulation only. Physical ADAPTIVE is unavailable.

### Known limitations

The documented test hardware uses iMana 200 firmware 7.38, manufacturer ID 2011, product ID 0xAA81. Earlier manual tests established read access and a limited SSH manual mode, but the new driver still needs real hardware validation of output parsing, identity, health and repeated leases. Never use unverified OEM write commands. See [safety acceptance status](../../refactor-status.md).
