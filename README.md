# HomeServer Fan Control

Experimental offline adaptive thermal controller for Huawei iMana 200, compatible with Node.js 22+ and Bun. No dependencies. MIT licensed.

```sh
npm test
npm start
# or
bun src/main.mjs
```

The first alpha parses iMana sensor tables and simulates cooling decisions. It does not connect to BMC or write fan settings. All included values and thresholds are **synthetic simulation examples**, not validated safe hardware limits. The signed DTS is not an absolute temperature; the exact interpretation must be verified for each platform.

## Safety roadmap

- Read-only polling and model/firmware detection.
- Baseline automatic-mode fan RPM and temperatures under representative loads.
- Account for unmonitored DIMMs, RAID, disks, NIC and GPU using independent telemetry.
- Verify firmware minimum and physically test a short, nonzero manual-mode timeout before enabling writes. Never command zero fan speed.
- Confirm command results and RPM readback; return to BMC automatic control on missing telemetry, fan faults, overheating, or shutdown. Never use a permanent manual-mode timeout.

Reference: Huawei Server iMana 200 User Guide, sections 3.10–3.11, describes fanlevel and fanmode. A manual-mode lease can be requested using `ipmcset -d fanmode -v 1 60`; exact firmware behavior requires validation. Automatic mode is `ipmcset -d fanmode -v 0`.

## 中文

面向家庭服务器的静音温控。首版只解析 iMana 200 的传感器并模拟风扇决策。升温快速升速、降温延迟逐步降速、异常返回自动模式。暂不接入米家和睡眠数据。禁止停转，不将示例转速视为安全值。实际写入功能尚未实现。
