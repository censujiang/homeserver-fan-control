## v0.3.0-alpha.2 — Online updates / 在线更新

- Web software update page: stable/preview channels, GitHub Release discovery, download progress and SHA-256 verification.
- Standalone CLI --version, --check-update, --update; atomic replacement with .previous backup and manual restart.
- Docker-aware asset selection; load the new image on the host and recreate with the same data volume.
- Improved curl quick-start and separate built-in hardware plugin documentation.

公开 Alpha 发行。真实硬件风扇写入仍被禁用，外置插件隔离尚待实机验证；保留原厂 AUTO。更新不会自动重启或修改正在运行的程序。请在停止服务、备份数据后执行 CLI 更新。

Public alpha; physical fan writes remain disabled and external plugin isolation needs validation. Keep factory cooling in AUTO. Stop the service and back up data before applying updates. See docs/updates.md.
