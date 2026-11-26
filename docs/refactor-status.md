# v0.3 implementation status

This is a draft implementation, not acceptance of the complete v0.3 specification.

Implemented in source: Nuxt SPA, Nitro lifecycle monitor, SQLite WAL and first migration,
encrypted connection configuration, administrator setup and login, instance CRUD, plugin
interface and registry, schema-driven connection form, history and events, dry-run engine,
read-only local IPMI and SSH shell, mock driver, baseline compile and smoke-test workflow,
systemd unit. The initial implementation was read-only. Current releases implement opt-in real iMana 200 SSH control using a 30-second hardware lease and readback; Local IPMI remains read-only. Mock covers the executor; hardware integration and sustained load validation are still outstanding.

Unverified / incomplete:
- Exact iMana SSH prompt, output parsing, BMC identity and health status need real captures.
- Local IPMI supports /dev/ipmi0 only, local OEM writes are not verified.
- Continuous SSH timed lease renewal, readback, auto restoration, all thermal zones and
  safe lower bound must be verified before implementing/enabling physical adaptive control.
- Hardware identity deduplication and safe mode changes must be verified before writes.
- External ZIP validation, install/uninstall, registry toggles and experimental bubblewrap worker are implemented in source. Compiled worker, namespace isolation, resource limits and end-to-end execution remain unverified. Leave execution disabled.
- UI policy editing is JSON, not an interactive curve; history is a list, not a chart.
- Polling is used instead of push. Linux auxiliary monitoring, backups via UI, explicit
  connection test, policy CRUD, audit coverage, configurable retention remain incomplete.
- Lockfile and actual target CPU support require verification. Earlier CI passed type checking, lint, six tests, build, compile and standalone smoke test.
- Public alpha releases are allowed; never advertise them as production-ready before full acceptance.

## Hardware safety gate
Keep factory AUTO. Capture real SSH and IPMI output without secrets.
Validate identity, health, every required sensor and readback. Validate 30-second
hardware fallback and repeated renewals independently; do not infer local OEM commands
from unrelated models. Validate airflow with all installed components including PCIe/GPU.
