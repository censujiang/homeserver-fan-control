## v0.3.0-alpha.13 — Unified installer / 统一安装更新脚本

- Root-level install.sh selects standalone or Docker interactively and supports existing installations.
- Correct SemVer ordering across paginated GitHub Releases, including out-of-order alpha.9/alpha.10/alpha.11; skip drafts and incomplete assets.
- Download and verify SHA-256, preserve executable and data backups; restart verified systemd services or standard Docker containers. Existing Screen/foreground processes must be stopped before updating.
- Default loopback bind; no Docker socket or automatic privilege escalation. Custom Docker/Compose deployments are deliberately not reconstructed.
- Installer syntax and offline release-selection regression tests added to CI.
- Retain alpha.11 SSH compatibility fixes and alpha.10 Web updater. Physical fan-control and full installer deployment tests remain pending.

- Fix first installation on LAN: accept 0.0.0.0 for standalone and Docker with explicit restricted-network confirmation; enable initial password setup automatically. systemd uses a boot-scoped drop-in. No change to the default loopback listener.
