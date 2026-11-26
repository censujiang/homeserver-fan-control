# 在线更新 / Online updates

## 简体中文

更新来源固定为本项目公开 GitHub Releases；无需账号或 Token。稳定通道忽略预发行版本，预览通道包含 Alpha、Beta、RC。当前 Alpha 默认使用预览通道。比较 SemVer 版本而非发布时间，仅选择更新且包含匹配附件及 SHA256SUMS 的版本。需要服务器能够访问 api.github.com、github.com 及 GitHub 发行附件 CDN。

### Web 管理后台

管理员登录后进入「软件更新」，选择通道并检查更新。下载由服务器执行，显示进度；大小及 SHA-256 校验通过后保存至数据目录 updates/，不自动执行或重启。源码部署只检查版本。校验文件与发行附件来自同一 GitHub Release，并非独立数字签名；请信任本项目的 GitHub 发行账户及 HTTPS。

### 独立二进制

先备份整个数据目录并停止服务，再执行：

```sh
./homeserver-fan-control-linux-x64-baseline --check-update
./homeserver-fan-control-linux-x64-baseline --update
```

可附加 --stable 或 --preview。命令会重新从官方 Release 下载和校验，原子替换当前可执行文件，保留 .previous；不会采用可能被本地修改的暂存文件，也不会自动启动进程。若使用 systemd：

```sh
sudo systemctl stop homeserver-fan-control
sudo /usr/local/bin/homeserver-fan-control --update
sudo systemctl start homeserver-fan-control
```

如果更新失败，原程序保留（若已创建 .previous，请先另存再重试）。如果新版本启动失败，停止服务、将 .previous 恢复为原文件名、必要时恢复升级前数据备份，再启动。不要让 Web 服务拥有系统程序目录的写权限。升级期间保留 BMC 原厂 AUTO。

### Docker

Web 可以下载经过校验的 Docker 镜像归档到数据卷。使用宿主机上的 Docker CLI 将文件导出（例如 docker cp 容器名:/data/updates/实际文件名 ./update.tar.gz），docker load -i ./update.tar.gz，再使用相同端口、原数据卷、设备映射和权限重建容器。镜像标签 homeserver-fan-control:ci。不要挂载 Docker socket，也不要在容器中自更新。建议重新从官方 Release 验证归档 SHA-256 后再导入。

## English

The updater reads public GitHub Releases from this repository, without a token. Stable excludes prereleases; preview includes alpha/beta/RC. Alpha installations default to preview. It compares SemVer, accepts only newer compatible assets with SHA256SUMS, and requires connectivity to GitHub API and release CDN.

Administrators can check and download updates in the Web UI. Size and SHA-256 are verified before saving to updates/ inside the data directory; monitoring continues and nothing is executed or restarted automatically. Source deployments only check versions. The checksum is published by the same release account, not an independent signature.

For standalone deployments, back up the data directory and stop the service first. Run the current binary with --check-update or --update, optionally --stable or --preview. The CLI downloads afresh from GitHub, verifies the asset, atomically replaces its own executable and keeps .previous. It never trusts a locally staged archive for privileged installation. Start the service manually. Move any existing .previous backup before the next update. If startup fails, stop the service, restore the previous binary and pre-upgrade data if necessary, then restart. Do not grant the Web service write access to system executable directories.

For Docker, export the verified archive from the data volume using docker cp, verify against the official Release SHA-256, load with docker load -i, then recreate the container with its original volume, ports and device permissions. Image tag: homeserver-fan-control:ci. Do not mount the Docker socket or self-update inside the container.

[Project README](../README.md)
