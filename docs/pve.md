# PVE / Linux monitoring (legacy reference)

For current setup, see the [Huawei iMana 200 built-in plugin guide](plugins/builtin/huawei-imana-200.md) and [project README](../README.md). PVE is one deployment context, not the only recommended physical host.

The original prototype notes below are retained for historical reference.

Requires Bun or Node 22+, ipmitool, and permission to open /dev/ipmi0. Run from repository root:

```sh
node src/monitor.mjs --once
bun src/monitor.mjs
```

The monitor logs current readings plus simulated decisions as JSON. It does not send any fan-setting commands, and must not be treated as a live fan controller. Keep BMC automatic cooling enabled.

Local sensor polling was verified by the operator on Huawei manufacturer ID 2011, product 0xAA81, firmware 7.38. A separate SSH test confirmed a 30-second manual timeout and acceptance of 30% fan level. Idle RPM was approximately 2160 front and 1800–1920 rear, comparable to auto. No lower speed was verified. Local OEM fan commands remain unverified. Do not transplant OEM writes or timeout encodings from unrelated server generations.

The example configuration is simulation-only. Unobserved thermal zones (DIMM, RAID, NIC, storage, GPU) still need consideration before manual control.
