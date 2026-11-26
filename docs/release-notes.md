## v0.3.0-alpha.5 — Administrator setup validation / 管理员初始化修复

- Trim leading/trailing setup-token whitespace and require exactly 64 hexadecimal characters.
- Return HTTP 400 for invalid setup/login input instead of uncaught Zod errors (HTTP 500).
- Provide bilingual setup instructions and actionable validation errors in the Web UI.
- Add HTTP regression tests for malformed token, short password, incorrect token, invalid login and whitespace-tolerant initialization.
- Retain Bun 1.4.5 and Ivy Bridge compatibility gate.

保留现有数据目录；不需要重新初始化已创建的管理员。真实风扇写入仍未开放。
Keep the existing data directory; already initialized administrators do not need to set up again. Physical fan writes remain disabled.
