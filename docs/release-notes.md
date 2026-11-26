## v0.3.0-alpha.3 — Startup management and plugin onboarding / 启动管理与插件接入

- Web boot startup status, user systemd setup and copyable host commands.
- CLI --autostart-status and --enable-autostart; preserves current host, port and data path without immediate duplicate start.
- Docker restart-policy guidance; no Docker socket access.
- Agent-friendly external plugin onboarding: local/SSH read-only discovery, fixtures, SDK constraints and ZIP example.

公开 Alpha：真实硬件写入仍禁用；外置插件隔离仍待验证，不能直接访问网络或宿主机硬件。systemd 一键设置取决于实际宿主机用户管理器及 linger 授权；无权限时手动配置。保留原厂 AUTO。

Public alpha: physical writes remain disabled; external sandbox does not allow direct hardware/network access. One-click systemd setup depends on host user manager and linger permissions. Keep factory AUTO.
