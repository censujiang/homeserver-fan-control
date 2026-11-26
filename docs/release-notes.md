## v0.3.0-alpha.4 — Legacy CPU compatibility / 老款 CPU 兼容性

- Upgrade build runtime and Docker build stage from Bun 1.3.13 to 1.4.5.
- Use the unified Linux x64 compilation target; retain the existing baseline asset name for updater compatibility.
- Add an Ivy Bridge CPU emulation startup gate to CI, covering the executable, SQLite initialization and HTTP startup.
- Actual hardware: Bun 1.4.5 JavaScript and SQLite passed on an Ivy Bridge Xeon E5 v2 host. The complete rebuilt executable still needs physical-host verification.

旧版本 Bun 1.3.13 在目标实机发生 Illegal instruction。请重新下载新版二进制或 Docker 镜像，旧二进制内置运行时不会因系统安装新版 Bun 而改变。保留数据目录和原厂 AUTO；物理风扇写入仍未开放。

Older releases embed Bun 1.3.13 and crashed on the target host. Download the new executable or Docker image; updating the host Bun does not change an embedded runtime. Preserve the data directory and factory AUTO mode. Hardware writes remain disabled.
