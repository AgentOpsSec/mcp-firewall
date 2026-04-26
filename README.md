# MCP Firewall

**Let AI agents use tools without giving them your whole machine.**

MCP Firewall is a local policy gateway for MCP tool calls. It sits between AI
clients and MCP servers, applies project policies, blocks dangerous actions,
supports project approvals, and records what happened.

Think of it as:

```txt
A firewall for MCP tool calls
```

## Why This Exists

MCP servers give AI agents access to real tools: filesystems, shells, browsers,
GitHub, databases, cloud APIs, email, calendars, and more.

That power needs a control point:

- Which tool calls should be allowed automatically?
- Which actions should be blocked until a developer approves them?
- Which paths should agents never read?
- Which shell commands are safe for this project?
- Which GitHub or database actions are too broad?
- What happened when a tool call was allowed or blocked?

MCP Firewall gives developers a local-first way to enforce those decisions.

## Install

```bash
npm install -g @agentopssec/mcp-firewall
```

Or run it without installing:

```bash
npx -y @agentopssec/mcp-firewall init
```

## Update

```bash
mcp-firewall update          # check the registry, prompt before installing
mcp-firewall update --yes    # update without prompting
```

## Primary Workflow

MCP Firewall starts with a local proxy and a human-readable policy:

```bash
mcp-firewall proxy -- node ./mcp-server.js
```

Note: the proxy enforces policy on the **client → server** direction
(typical `tools/call` flow). Server → client traffic is forwarded as-is.

The workflow should do three things well:

1. Intercept MCP tool calls.
2. Apply allow, warn, and block rules.
3. Record tool-call decisions locally.

## CLI

```bash
mcp-firewall init
mcp-firewall add ./mcp.json
mcp-firewall run claude
mcp-firewall run codex
mcp-firewall run cursor
mcp-firewall proxy -- node ./mcp-server.js
mcp-firewall proxy --check '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"shell.exec","arguments":{"command":"npm test"}}}'
mcp-firewall policy init
mcp-firewall import-doctor mcp-doctor-scan.json
mcp-firewall logs
mcp-firewall approve latest
mcp-firewall update [--yes]
```

## Standalone and Stack Use

MCP Firewall runs on its own with local policies and logs:

```bash
mcp-firewall init
mcp-firewall check --tool shell.exec --input '{"command":"npm test"}'
```

When used with the full AgentOpsSec stack, it can import MCP Doctor scan reports
as optional context and its logs can be reviewed by Agent Review:

```bash
mcp-doctor scan --json --output mcp-doctor-scan.json
mcp-firewall import-doctor mcp-doctor-scan.json
agent-review --from-mcp-firewall
```

## What MCP Firewall Controls

MCP Firewall applies policy to line-delimited JSON-RPC MCP tool calls passed
through `mcp-firewall proxy`. It can also evaluate individual calls with
`mcp-firewall check`.

It controls local MCP activity, including:

- Filesystem reads and writes
- Shell command execution
- Network and browser access
- GitHub repository actions
- Database queries and mutations
- Email and calendar actions
- Secret and credential access
- Project-level tool permissions
- Per-server rules
- Per-client rules
- Tool-call logging
- User approval decisions

## Example Approval

```txt
MCP Firewall Approval by github.com/AgentOpsSec

Agent wants to run a shell command.

Command:
rm -rf ./dist

Risk:
Medium

Reason:
The command deletes a build directory.

Actions:
[Allow once] [Always allow for this project] [Block]
```

## Policy Example

```json
{
  "project": "my-nextjs-app",
  "defaultAction": "warn",
  "rules": [
    {
      "tool": "filesystem.read",
      "scope": "./",
      "action": "allow"
    },
    {
      "tool": "filesystem.read",
      "scope": "~/.ssh",
      "action": "block"
    },
    {
      "tool": "filesystem.read",
      "scope": ".env",
      "action": "block"
    },
    {
      "tool": "shell.exec",
      "command": "npm test",
      "action": "allow"
    },
    {
      "tool": "shell.exec",
      "action": "warn"
    }
  ]
}
```

Supported actions:

```txt
allow
warn
block
approve_once
approve_for_session
approve_for_project
log_only
```

## What MCP Firewall Records

MCP Firewall keeps local audit logs for:

- Tool name
- Tool input
- Tool output
- Risk score
- User decision
- Timestamp
- Project path
- Client name
- Server name
- Policy matched
- Whether execution was allowed or blocked

## Example Log Shape

```json
{
  "tool": {
    "name": "MCP Firewall",
    "by": "github.com/AgentOpsSec",
    "repository": "github.com/AgentOpsSec/mcp-firewall"
  },
  "timestamp": "2026-04-25T15:30:00Z",
  "project": "my-nextjs-app",
  "client": "codex",
  "server": "filesystem",
  "tool": "filesystem.read",
  "risk": "high",
  "action": "block",
  "policyMatched": "block-env-files",
  "input": {
    "path": ".env"
  }
}
```

## Design Principles

- Local-first
- Open-source
- No telemetry by default
- Human-readable policies
- Terminal-native approvals
- Per-project control
- Secure defaults
- Clear local audit logs

## Initial Release Scope

The initial release includes a local stdio JSON-RPC proxy, local policy
enforcement, project approvals, filesystem and shell rules, and local logging.

### 1.0: Local Proxy

- Start MCP Firewall as a local gateway
- Register existing MCP server configurations
- Route MCP tool calls through the gateway
- Identify client, server, tool name, and tool input
- Preserve normal MCP behavior for allowed calls
- Print clear terminal activity

### 1.0: Policy Enforcement

- Initialize a project policy file
- Support allow, warn, and block decisions
- Apply filesystem scope rules
- Apply shell command rules
- Block sensitive paths such as `.env` and `~/.ssh`
- Allow common project commands such as `npm test`
- Explain which policy matched a tool call

### 1.0: Approvals and Logs

- Approve logged actions explicitly with `mcp-firewall approve`
- Support allow once and approve for project decisions
- Record every tool call decision locally
- Show recent firewall logs
- Inspect the latest blocked or approved action
- Emit JSON logs for automation and review


## Output

Reports use plain-language status words rather than raw exit codes:

- `ok` — the step ran successfully (green).
- `failed (exit N)` — the step exited non-zero (red); the original code is preserved.
- `skipped (reason)` — the step was not applicable (dim).

Severity colors follow the AgentOpsSec palette (safe = green, warning = amber, risk = red). The palette honors `NO_COLOR` and `FORCE_COLOR`, and JSON / CSV output stays plain.


- Repo: https://github.com/AgentOpsSec/mcp-firewall
- npm: https://www.npmjs.com/package/@agentopssec/mcp-firewall
- AgentOpsSec stack: https://github.com/AgentOpsSec/stack
- Website: https://AgentOpsSec.com

## Author

Created and developed by **Aunt Gladys Nephew**.

- Website: https://auntgladysnephew.com
- GitHub: https://github.com/auntgladysnephew
- X: https://x.com/AGNonX
