# Changelog

All notable changes to this project are documented in this file.
This project follows [Semantic Versioning](https://semver.org/) and the
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) format.

## [1.0.0] - 2026-04-26

- Initial public release of MCP Firewall.
- Local stdio JSON-RPC proxy that enforces policy on the client → server direction (`tools/call` flow).
- Commands: `init`, `add`, `run`, `logs`, `approve`, `policy`, `check`, `proxy`, `import-doctor`, `update`.
- Project approvals, allow/warn/block decisions, sensitive-path scope rules, and per-tool-call audit logs in `.mcp-firewall/logs.jsonl`.
- Imports MCP Doctor scan reports without depending on Doctor code.
- Status words use plain language (`ok`, `failed (exit N)`, `skipped (reason)`); raw exit codes are preserved alongside for debugging.
