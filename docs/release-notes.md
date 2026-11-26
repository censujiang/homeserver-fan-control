## v0.3.0-alpha.14 — SSH host key pinning diagnostics

- Accept one or more independently verified SHA256 host key fingerprints (comma separated); preserve strict verification.
- Display observed and configured fingerprints on mismatch; never trust an unknown key automatically.
- Add regression tests for multiple pins and mismatch diagnostics.
- Includes unified installer and LAN first-installation fixes. Hardware connectivity still needs validation.
