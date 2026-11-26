## v0.3.0-alpha.10 — Web self-update / 网页自更新

- Supervised Linux standalone process supports verified Web installation and automatic restart, including foreground, Screen and systemd launches.
- Revalidate staged binary, check candidate version, preserve versioned executable and cold SQLite backups, replace atomically, verify restarted HTTP version, attempt binary rollback on failure.
- Browser waits and reloads; sign in again after restart. Stop physical ADAPTIVE control before installing. No privilege escalation or Docker socket.
- CLI uses versioned backups; older releases require one final manual transition to this supervisor-capable version.
- Docker and source installation remain manual. Legacy CPU test continues to exercise the actual serving binary; physical updates and repeated iMana lease testing still need real-host validation.

保留数据目录。自动回滚只保证尝试恢复旧二进制，数据库不兼容时需使用冷备份恢复；不要将生产系统暴露至不可信网络。
