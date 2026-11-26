## v0.3.0-alpha.9 — Experimental iMana SSH control / iMana SSH 实验调速

- Implement explicit experimental SSH ADAPTIVE for iMana 7.38, board 0xaa09, verified serial identity and pinned SSH key.
- Parse actual health and fan mode/level/remaining-time replies (including values without a percent sign).
- Mandatory two CPU DTS, inlet and eight rotor guards; 30–100% target, finite 30-second leases, readback, fallback and fault latch.
- UI capability/mode indicators and Stop control / AUTO action. Default remains MONITOR.
- Local IPMI remains read-only: legacy OEM write protocol and timeout have not been verified.
- Unit tests use recorded reply formats; physical repeated lease renewal/load testing still pending.

默认不接管真实硬件。请先使用 MONITOR/DRY_RUN，在现场监护下测试。仅 30% 和单次 30 秒回退已有实机依据；不保证连续续期或负载表现。保留原有数据目录。
