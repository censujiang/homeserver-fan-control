# 外部插件快速接入 / External plugin quick start

[简体中文](#简体中文) | [English](#english) | [SDK](../../plugin-sdk.md) | [项目 / Project](../../../README.md)

## 简体中文

**推荐先让编程智能体阅读本文、SDK 和现有驱动，再根据真实硬件输出编写插件。** 不需要先知道厂商私有协议；先收集只读证据，确定传输、设备身份、传感器含义，再实现解析和测试。请勿把密码、私钥、完整序列号或公网地址交给智能体。

### 1. 给智能体的任务模板

```text
阅读 docs/plugins/external/quick-start.md、docs/plugin-sdk.md、
shared/model.ts、server/core/external.ts 和 examples/plugin/。
参考 server/drivers/imana.ts，但不要复制其他硬件的 OEM 写指令。
目标设备：<厂商、型号、BMC 固件>。
传输：本地系统接口 / SSH（分别调查）。
我将提供脱敏的只读命令输出。先给出检测命令，再分析设备身份、
传感器单位、状态、缺失值和错误；基于真实输出制作 fixtures 和测试。
实现 manifest.json、index.mjs、README.md，并生成 ZIP。
说明当前沙箱限制，真实硬件接入需要核心审查的地方单独列出。
不得猜测风扇写入命令、默认安全转速、温度阈值或关闭原厂散热。
```

### 2. 先在目标环境检测（两条路线）

以下均为只读探测建议；在授权设备上执行。保持原厂 AUTO，按厂商文档选择可用命令。记录命令、退出码、完整但脱敏的输出、型号与固件版本。

**A. 本地 / 内置系统接口（bare metal）**

适用于应用运行在被管理的 Linux 物理机。先确认设备与工具是否存在，不要盲目写 sysfs 或发 OEM raw 指令。

```sh
uname -m
cat /etc/os-release
ls -l /dev/ipmi* 2>/dev/null
command -v ipmitool
command -v sensors
ipmitool -I open mc info
ipmitool -I open mc guid
ipmitool -I open sensor list
ipmitool -I open sdr elist
sensors -j
ls -l /sys/class/hwmon
```

有权限时可读取 hwmon 的 name、temp*_input、fan*_input、相应 label。Linux hwmon 温度通常以毫摄氏度表示，必须核对驱动 ABI。记录 CPU、内存、进风、出风、存储、网卡、GPU、风扇组等实际可观测项；不要把未检测到的传感器填成零。区分 OpenIPMI、hwmon 和厂商工具，记录设备节点权限。没有 IPMI 设备时，不要默认当前机器支持 IPMI；也不要使用特权容器来绕过设备权限。

**B. SSH 远程管理接口**

适用于 BMC 有独立管理网络，或应用部署在虚拟机/其他机器。先从可靠渠道验证主机公钥指纹；再测试正常认证和交互方式。

```sh
BMC_IP=192.0.2.10  # replace with your authorized BMC address
BMC_USER=operator  # replace with your username
ssh-keyscan -p 22 "$BMC_IP" > bmc-hostkey.pub
ssh-keygen -lf bmc-hostkey.pub -E sha256
# Only after independent fingerprint verification and known_hosts enrollment:
ssh -p 22 -o StrictHostKeyChecking=yes "$BMC_USER@$BMC_IP"
```

ssh-keyscan 的结果本身不可信：需与设备控制台、厂商界面或已知可信指纹独立比对，再将核验过的密钥加入 known_hosts。不要使用 StrictHostKeyChecking=no。不要把密码写入命令行。进入设备 CLI 后，先查看厂商文档支持的 help / ? / version、设备身份、传感器、风扇模式等只读命令；并确认 SSH Exec 是否支持，还是必须保持 PTY 交互式 Shell。记录提示符、分页、回显、编码、超时、断连、认证失败等。对 Huawei iMana 200 可参考[内置插件指南](../builtin/huawei-imana-200.md)的已知限制，不能把其命令直接套用其他设备。

**两种方式共同验收**：区分温度与热裕量（DTS），RPM 与百分比，采集时间与过期数据，风扇停转与缺失读数，重复传感器名与唯一 ID，设备身份（同一物理机可能有两种传输）。无证据时 health=unknown、value=null、valid=false；不能自动降速。先记录正常、异常、断线等 fixtures 再测试解析。不能从 SSH 能登录推断支持调速。

### 3. 当前外部 SDK 的边界

重要：目前 ZIP 插件是**隔离的只读快照协议**，不是拥有硬件访问权的通用驱动。沙箱没有网络，也没有真实 /dev/ipmi0 或宿主机 hwmon 映射，因此外置 ZIP 不能直接执行 SSH、读取宿主机 IPMI 或修改风扇。上述探测必须在宿主机手动进行；可以先编写离线解析器、用脱敏 fixtures 验证，再将真实硬件传输作为内置驱动 PR 或后续受控能力代理的提案。不得通过关闭沙箱、添加任意命令执行、挂载 Docker socket 或授予 root 来绕过。

内置驱动开发参考 shared/model.ts 的 Plugin / Driver 接口、server/drivers/imana.ts、server/drivers/parse.ts 和 server/core/registry.ts。定义 connect、identify、capabilities、sample、close；在未验证时 auto/manual 抛错、write=false、timedFallback=false。外置插件运行仍为实验功能，默认禁用，隔离实机验证前不要启用。

### 4. 最小 ZIP 插件

在独立空目录创建 manifest.json 和 index.mjs。以下演示数据不是实际温度。

```json
{
  "id": "example.my-server",
  "name": "Example server",
  "description": "Synthetic read-only snapshot",
  "version": "1.0.0",
  "apiVersion": 1,
  "author": "Your name",
  "entry": "index.mjs",
  "permissions": [],
  "minCoreVersion": "0.3.0",
  "modes": [
    {
      "id": "sample",
      "label": "Sample",
      "fields": [
        {"key":"temperature","label":"Demo temperature","type":"number","default":25}
      ]
    }
  ]
}
```

```js
export async function sample(mode, config) {
  if (mode !== 'sample') throw new Error('Unsupported mode')
  const at = Date.now()
  const value = Number(config.temperature ?? 25)
  return {
    at, identity: null, health: 'unknown',
    sensors: [{
      id: 'demo.cpu', name: 'Demo CPU', kind: 'temperature',
      value: Number.isFinite(value) ? value : null,
      unit: 'C', raw: String(value),
      valid: Number.isFinite(value), health: 'unknown', at
    }]
  }
}
```

在宿主机先离线验证（只运行自己审查过的代码）：

```sh
bun -e 'import {sample} from "./index.mjs"; console.log(JSON.stringify(await sample("sample",{temperature:25}),null,2))'
zip -j example.my-server.zip manifest.json index.mjs
unzip -l example.my-server.zip
```

ZIP 根目录只允许 manifest.json、index.mjs，及可选 README.md、config.schema.json；不允许嵌套目录、node_modules、链接或任意附加文件。压缩包最多 2 MiB，解压总量最多 4 MiB，每个文件最多 2 MiB。需要依赖时先在开发阶段自行打包为独立 JS，不应依赖运行时 npm install。config.schema.json 当前只是可选归档文件，Web 表单根据 manifest.modes[].fields 生成。字段类型 text/password/number。ID 不得重复或使用保留的 mock、huawei.imana200。Sample 最多 128 个传感器；kind 可为 temperature、thermal-margin、power、rpm、percent、discrete。详情见 [SDK](../../plugin-sdk.md)。

### 5. 上传和验证

管理员进入「插件」上传 ZIP，安装默认禁用，不会立即执行。只有在非 root Linux 独立二进制、bubblewrap 与隔离环境验收通过、宿主机显式设置 HSFC_EXTERNAL_PLUGINS=1 时才尝试启用。添加服务器选择该插件、模式及参数，在 MONITOR 下查看采样和错误。当前外置快照的设备 identity 会置为 null、总体 health 为 unknown，不允许真实 ADAPTIVE。删除实例后才能禁用或卸载插件。提交插件时附上版本、支持型号/固件、脱敏 fixtures 的测试结果、已知限制，避免声称尚未验证的能力。

## English

**Ask a coding agent to read this guide, the SDK and existing drivers before implementing a plugin.** Collect read-only evidence first, identify the transport, hardware identity and sensor semantics, then write parsers and tests. Never provide credentials, private keys, unredacted serial numbers or public management addresses.

Suggested agent task: read this guide, docs/plugin-sdk.md, shared/model.ts, server/core/external.ts, examples/plugin and the iMana reference driver. Ask for a read-only discovery checklist for the exact vendor, model and firmware; analyze sanitized captures; create fixtures and tests; produce manifest.json, index.mjs, README.md and a ZIP. List unsupported capabilities separately. Never invent OEM writes, cooling thresholds, minimum fan speeds or disable factory cooling.

### Discovery: local and SSH

- **Local/bare metal:** use the commands in section A above to inspect Linux, device nodes, OpenIPMI manufacturer/product/firmware and GUID, sensor/SDR data and hwmon readings. Read only documented interfaces. Validate units (hwmon temperatures commonly use millidegrees Celsius), labels, unique identities, device permissions and missing values. Keep factory AUTO.
- **SSH:** use the commands in section B above to collect the host key and independently verify its fingerprint before trusting it. Authenticate normally and inspect documented read-only help, version, hardware identity, sensor and fan-state commands. Determine whether SSH Exec is supported or a persistent PTY shell is needed; capture prompts, pagination, echoes, timeouts and disconnections. Do not disable host-key checking or put passwords in arguments. Vendor commands are not interchangeable.
- Both transports: normalize Celsius versus thermal margin, RPM versus percent; validate freshness, duplicate IDs, unavailable values, faults and fan stalls. Build sanitized fixtures for healthy, missing, invalid, timeout and disconnected cases. Never infer write capability from successful reads.

### Current SDK limitation

ZIP plugins implement an experimental, sandboxed read-only snapshot API. The sandbox has no network, physical IPMI device or host hwmon mapping, so external ZIP plugins cannot directly use SSH or local hardware. Perform discovery on the authorized host first; implement/test offline parsers, then propose a reviewed built-in Driver or a future controlled capability broker for actual hardware. Do not weaken isolation, mount the Docker socket or run arbitrary root commands.

For the built-in route, read shared/model.ts, server/drivers/imana.ts, server/drivers/parse.ts and server/core/registry.ts; implement connect, identify, capabilities, sample and close. Until validated, reject auto/manual writes and advertise write=false and timedFallback=false.

### Build a minimal plugin

Use the manifest.json and index.mjs examples in section 4 above, or copy examples/plugin. Export async sample(mode, config), returning a Sample. Use stable unique sensor IDs, explicit kinds, numeric or null values, UTC epoch milliseconds, raw data and honest health/validity. The sample is synthetic, not hardware data.

Test your own reviewed code with Bun and create a ZIP at the archive root:

```sh
bun -e 'import {sample} from "./index.mjs"; console.log(JSON.stringify(await sample("sample",{temperature:25}),null,2))'
zip -j example.my-server.zip manifest.json index.mjs
unzip -l example.my-server.zip
```

Only manifest.json, index.mjs, and optional README.md/config.schema.json are accepted. No nested files, dependencies, or symlinks. Max 2 MiB ZIP, 4 MiB extracted, 2 MiB/file; at most 128 sensors per sample. Bundle dependencies yourself during development; no runtime npm install. The UI is generated from manifest.modes[].fields (text/password/number); config.schema.json is currently archived only. Reserved IDs cannot be reused. See [SDK](../../plugin-sdk.md).

### Install and test

Sign in as administrator, upload the ZIP in Plugins; installation does not execute code and starts disabled. Execution is experimental: only after a verified non-root standalone Linux binary and bubblewrap isolation, with explicit host opt-in HSFC_EXTERNAL_PLUGINS=1. Enable the plugin, create a MONITOR instance, inspect data/errors. External snapshot identity is cleared and overall health forced to unknown; physical adaptive mode is blocked. Remove instances before disabling/uninstalling. Document hardware model/firmware, sanitized fixture tests and known limitations. Do not advertise unverified features.
