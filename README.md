# HomeServer Fan Control

Nuxt / Nitro / Vue SPA / Bun / SQLite refactor — **read-only alpha**, not production-ready.
This preview deliberately cannot enter physical ADAPTIVE mode or send fan writes.
MIT license. Existing offline prototype remains in src/ and test/ as reference only.

## Development
Install Bun 1.3.x, then run bun install, bun run dev, bun run test, bun run typecheck and bun run lint.
Open http://127.0.0.1:3000, read the setup-token from HSFC_DATA_DIR (default ./data),
and initialize a password of at least 12 characters. Use a local browser or SSH port forwarding.
Do not expose plain HTTP to untrusted networks. Use HTTPS through an authenticated reverse proxy.
The SQLite database and its encryption key must be backed up together while the service is stopped.
For a systemd deployment use the service template and install script; grant the service user only
the required local IPMI device permission, never run the web process as root.

## Connections
* Local IPMI requires /dev/ipmi0 and /usr/bin/ipmitool. No SSH credentials needed.
* SSH uses a persistent shell and an independently verified SHA256 host-key fingerprint;
  never copy a fingerprint from an untrusted first connection.
* Mock supports dry-run with the example CPU/fan IDs, without touching hardware.

## Build
Run bun run build, then bun run compile. The target is Linux x64 baseline.
CI tests a copied executable outside the checkout. Build success and compatibility are not claimed
until CI passes and the executable has been tested on the target Xeon E5-2640 v2.
See docs/refactor-status.md for known gaps and safety acceptance gates.
