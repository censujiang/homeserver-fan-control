# Huawei iMana 200

[简体中文](#简体中文) | [English](#english) | [内置插件 / Built-in plugins](README.md) | [项目 / Project](../../../README.md)

## 简体中文

内置插件 ID：`huawei.imana200`。无需额外安装插件，在 Web 后台添加服务器时选择 Huawei iMana 200，再选择 SSH 或 Local IPMI。

**SSH 实验调速已接入；Local IPMI 仍只读。** 默认 MONITOR，真实 ADAPTIVE 需显式开启、现场监督验证。

### 连接方式与部署

| 方式 | 适用场景 | 所需条件 |
|---|---|---|
| SSH | 远程设备、PVE 虚拟机、容器 | BMC 管理 IP、端口、用户名、密码或私钥、已独立核验的 SHA256 主机公钥指纹 |
| Local IPMI | 被管理服务器的物理 Linux 宿主机 | /dev/ipmi0、/usr/bin/ipmitool、访问设备的最小权限 |

SSH 不依赖本地 IPMI，也不需要 root。同一 BMC 若提供 RSA、ECDSA 等多种主机密钥，可将分别独立核验的 SHA256 指纹用逗号分隔填入同一字段；不匹配时显示实际收到的指纹，仍拒绝连接。通过可靠渠道核验主机公钥指纹，不要盲目信任首次连接的指纹。

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

Local IPMI 模式配置设备 `/dev/ipmi0` 及超时（默认 12000 ms），当前使用 `/usr/bin/ipmitool`，无需 BMC 管理网络或 SSH 凭据。推荐在被管理的裸金属 Linux 物理机运行。Local IPMI 选择 MONITOR；DRY_RUN 仅模拟。SSH 可按下面说明开启实验 ADAPTIVE。

### 已知限制

文档记录的实机环境为 iMana 200 固件 7.38、厂商 ID 2011、产品 ID 0xAA81。旧款硬件曾验证读取及 SSH 有限手动模式，但新版驱动的输出解析、身份识别、健康状态及连续租约仍需重新实机验收。请勿尝试未经验证的 OEM 写入指令。更多见[安全验收状态](../../refactor-status.md)。

## English

Built-in plugin ID: `huawei.imana200`. No additional installation is needed. Add a server in the Web UI, select Huawei iMana 200, then SSH or Local IPMI.

**Experimental SSH control, read-only Local IPMI.** Default MONITOR; actual ADAPTIVE requires explicit opt-in and supervised validation.

### Transports and deployment

| Transport | Use case | Requirements |
|---|---|---|
| SSH | Remote BMC, VM, container | BMC address, port, credentials and independently verified SHA256 host-key fingerprint |
| Local IPMI | Physical Linux host | /dev/ipmi0, /usr/bin/ipmitool, restricted device access |

SSH does not require local IPMI or root. For a BMC with multiple host keys, enter independently verified SHA256 fingerprints separated by commas. Mismatches display the observed fingerprint and still reject the connection. Verify the fingerprint via a trusted channel, not merely the first SSH connection.

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

For Local IPMI, configure `/dev/ipmi0` and timeout (default 12000 ms). The current driver uses `/usr/bin/ipmitool`, with no management network or SSH credentials required. Prefer the managed bare-metal Linux machine. Select MONITOR; DRY_RUN is simulation only. Local IPMI ADAPTIVE is unavailable; SSH experimental ADAPTIVE is described below.

### Known limitations

The documented test hardware uses iMana 200 firmware 7.38, manufacturer ID 2011, product ID 0xAA81. Earlier manual tests established read access and a limited SSH manual mode, but the new driver still needs real hardware validation of output parsing, identity, health and repeated leases. Never use unverified OEM write commands. See [safety acceptance status](../../refactor-status.md).

## SSH 实验控制 / Experimental SSH control

仅支持已记录的 iMana 7.38、主板 0xaa09，且须成功读取有效序列号、核验 SSH 指纹。先用 MONITOR/DRY_RUN 确认全部传感器及健康，再在已连接的设备卡片点击「启用真实调速」或选择 ADAPTIVE（不需另外设置 control）。仅现场有人监护时尝试；30% 与 100% 的 SSH 设置已实机测试；中间值、连续续期和负载安全尚未实机确认。必须检查两颗 DTS、进风温度和全部八转子。每次手动租约 30 秒，严格读回，禁止永久手动；出错停止控制并尝试 AUTO，未确认时依赖硬件已验证的超时机制。切换 MONITOR/删除/关闭时尝试恢复 AUTO。不要并行运行其他风扇控制程序或使用手动模式。默认安全阈值是保守初始值而非实机校准；可收紧，不能放宽。

Only the recorded iMana 7.38 / board 0xaa09 profile with valid serial and pinned SSH key is eligible. Verify MONITOR/DRY_RUN first; explicitly choose ADAPTIVE or Enable real fan control on the device card. Supervise at the server. 30% and 100% SSH writes have been physically tested; intermediate targets, repeated renewal and load behavior remain unverified. Mandatory protections cover both DTS, inlet, all eight rotors. Finite 30-second leases, readback, and AUTO on failures; never permanent manual. Do not run other controllers concurrently. Switch MONITOR to stop. The conservative guard thresholds are not hardware-calibrated; users can tighten them.

Local IPMI OEM control remains unverified for this legacy firmware. The modern openUBMC read-only Get Fan Mode specification uses command 0x30/0x91 with vendor prefix db 07 00 and subcommand 02; its timeout is in minutes, not the verified SSH seconds. Do not assume compatibility or use its write commands on iMana 200.

低于 30% 的目标不受本驱动支持；0% 和 20% 的尝试曾出现风扇全速运转，原因尚未确定。不要尝试绕过 BMC 安全下限。界面区分策略目标与 BMC 已确认的真实目标，控制异常暂停并尝试恢复 AUTO。

Targets below 30% are unsupported. Attempts at 0% and 20% were observed to cause full-speed operation; the cause remains unconfirmed. Do not bypass BMC cooling limits. The UI distinguishes the policy target from the BMC-confirmed target and suspends control with attempted AUTO recovery on failure.
