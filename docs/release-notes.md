## v0.3.0-alpha.1 — Public safety preview / 公开安全预览

- Nuxt Vue SPA, Nitro scheduler, SQLite persistence and plugin SDK.
- iMana 200 SSH and local IPMI monitoring, Mock-only adaptive control.
- Standalone Linux x64 baseline executable, Docker image archive, Compose example.
- CLI --port, --host, --data-dir and environment variable support.

本版本为公开 Alpha 发行，并非生产级硬件风扇控制版本。真实硬件写入仍被禁用，外置插件执行尚待验证；请保留原厂自动散热。镜像及二进制均仅为 Linux amd64/x86_64，目标老款 Xeon 实机兼容性仍需测试。

This is a published alpha, not production-ready cooling control. Physical fan writes are disabled; external plugin execution is experimental. Keep factory cooling in AUTO. Linux x64 baseline compatibility on the target Xeon requires real-machine testing.

Verify assets with SHA256SUMS. Load the Docker archive using docker load -i; the image is tagged homeserver-fan-control:ci. See README.md for deployment.
