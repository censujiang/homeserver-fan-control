## v0.3.0-alpha.15 — Real SSH fan control

- Explicit ADAPTIVE mode or the Enable real fan control button activates the actual iMana SSH command path after hardware eligibility and health checks; no redundant text setting required.
- Separate BMC-confirmed manual target from policy demand; show AUTO, blocked and suspended states.
- Verify exact finite 30-second lease commands and readback in regression tests; attempt AUTO on failure and do not silently rearm failed writes.
- Keep 30–100% physical target range. Do not implement fan stop or sub-30% override: observed 0%/20% attempts caused full-speed operation; cause unconfirmed.
- Local IPMI remains read-only; real-machine end-to-end, sustained renewal and load safety remain unverified.
