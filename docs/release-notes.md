# HomeServer Fan Control v0.3.0

首个正式发行版 / First stable software release.

- Material Design 3-inspired responsive administration UI: desktop navigation drawer, mobile drawer, top app bar, semantic color tokens, overview cards, outlined inputs and sensor tiles.
- Light/dark themes and Chinese/English preference persistence; no external CDN, fonts or extra UI dependency.
- Real opt-in iMana 200 SSH fan control, BMC-confirmed manual targets, finite 30-second leases and AUTO recovery attempts.
- Unified installer, standalone Linux x86_64 binary and Docker image with SHA-256 verification. Stable channel is default, preview opt-in.
- Existing SQLite data, authentication, APIs and hardware safety gates remain unchanged.

**Hardware limitations:** physical fan control remains experimental; only the recorded iMana 200 firmware/board is eligible, 30–100% targets only. Local IPMI remains read-only. Sustained physical load/lease validation is outstanding. This software release is not production qualification of cooling hardware.
