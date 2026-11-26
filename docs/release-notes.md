## v0.3.0-alpha.11 — Legacy iMana SSH connectivity / 老款 iMana SSH 兼容性

- Enable password keyboard-interactive authentication for one non-echo password challenge.
- Append legacy 2048-bit diffie-hellman-group14-sha1 as fallback to modern SSH algorithms; no group1 or host verification bypass.
- Use explicit VT100 PTY, carriage return and strict iMana prompt matching.
- Report SSH fingerprint, authentication, handshake, network, interactive-shell and sampling failures in monitoring and event history without exposing credentials; slow retries for auth/key/negotiation failures.
- Keep physical writes opt-in; actual BMC SSH connectivity needs real-host verification.
