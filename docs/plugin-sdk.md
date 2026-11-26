# External plugin SDK (experimental)

Start with the [agent-friendly external plugin quick start](plugins/external/quick-start.md), including local and SSH hardware discovery. The current external sandbox cannot directly access hardware or network.

The built-in interface is in shared/model.ts. External v1 preview is a restricted read-only
snapshot protocol: export async sample(mode, config) from index.mjs and return the Sample
shape. ZIP manifest.json and index.mjs at archive root; optional README.md and config.schema.json.
Use examples/plugin as a starting point. No npm dependency installation is supported.
Only an administrator may upload ZIPs. Archive max 2 MiB, extracted max 4 MiB; file allowlist,
strict manifest validation and SHA256 entry integrity check. Installation does not execute code.

Execution is opt-in via HSFC_EXTERNAL_PLUGINS=1, non-root standalone binary and Linux bubblewrap
(/usr/bin/bwrap). Each sample runs in a separate process with network and PID namespaces,
read-only system libraries and plugin files, private tmp/dev, no application data directory
mount. No external hardware writes are supported. On systems where user namespaces or
bubblewrap are unavailable execution fails closed. This is a preview, not a complete
sandbox: CPU/memory limits, symlink and host-system review, binary worker and bwrap
compatibility tests are still required. Leave opt-in disabled until those pass.
