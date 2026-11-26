## v0.3.0-alpha.8 — Local startup installer and usability / 自启脚本与易用性

- Password-only administrator setup: no manual setup key; default loopback-only, explicit temporary opt-in for trusted LAN or Docker setup. Existing administrator and data remain unchanged.
- Grouped monitoring dashboard with search, collapsed discrete events, raw readings, translated health and normalized sensor units.
- Actual iMana discrete bitmaps remain unknown until vendor-specific event meanings are verified, rather than falsely marked as faults.
- Form-based optional simulation policy editor, advanced JSON, connection/mode explanations and links.
- Screen instructions for SSH disconnect and systemd guidance.
- Bun 1.4.5 and legacy CPU CI gate retained.

真实硬件写入仍禁用，原厂 AUTO 不受影响。首次初始化前不要向不可信网络暴露端口；已初始化用户无需重新设置密码。
Physical writes remain disabled. Keep factory AUTO. Do not expose an uninitialized server to untrusted networks; existing administrators do not need to set up again.

- Correctly clone and validate reactive Vue policy data when editing an existing server.

- Automatically generate a local setup-autostart.sh with current executable, port and data path; root and non-root support; no automatic restart or overwrite of conflicting units.
