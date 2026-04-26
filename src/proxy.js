import readline from "node:readline";
import { spawn } from "node:child_process";
import { TOOL } from "./constants.js";
import { applyApprovals, evaluateToolCall } from "./policy.js";
import { appendLog, loadState } from "./state.js";
import { nowIso } from "./utils.js";

export async function evaluateJsonRpcMessage(message, { policy, approvals = [], cwd = process.cwd(), client = "mcp-client", server = "mcp-server" } = {}) {
  const call = toolCallFromMessage(message, { client, server });
  if (!call) return { allowed: true, message };

  const base = evaluateToolCall(policy, call);
  const decision = applyApprovals(base, call, approvals);
  const entry = {
    eventId: `evt_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`,
    timestamp: nowIso(),
    type: "tool-call",
    client,
    server,
    toolCall: { tool: call.tool, input: call.input },
    ...decision
  };
  await appendLog(entry, cwd);

  if (decision.action === "block") {
    return {
      allowed: false,
      decision: entry,
      response: {
        jsonrpc: message.jsonrpc || "2.0",
        id: message.id ?? null,
        error: {
          code: -32001,
          message: `MCP Firewall blocked ${call.tool}: ${decision.reason}`,
          data: {
            tool: TOOL,
            decision: entry
          }
        }
      }
    };
  }

  return { allowed: true, decision: entry, message };
}

// proxyJsonLines enforces policy on the client -> server direction only.
// Server -> client traffic (notifications, sampling/createMessage requests,
// resource updates) is forwarded as-is. Tool-call enforcement matches the
// canonical MCP JSON-RPC pattern where `tools/call` is initiated by the client.
export async function proxyJsonLines({ command, args = [], cwd = process.cwd(), policy, client = "mcp-client", server = "mcp-server", io = defaultIo() }) {
  const child = spawn(command, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
  let spawnError = null;

  child.stderr.on("data", (chunk) => io.stderr(chunk.toString()));
  child.stdout.on("data", (chunk) => io.stdout(chunk.toString()));
  child.on("error", (error) => {
    spawnError = error;
    io.stderr(`${error.message}\n`);
  });

  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      child.stdin.write(`${line}\n`);
      continue;
    }
    const state = await loadState(cwd);
    const result = await evaluateJsonRpcMessage(message, { policy, approvals: state.approvals || [], cwd, client, server });
    if (result.allowed) child.stdin.write(`${JSON.stringify(message)}\n`);
    else io.stdout(`${JSON.stringify(result.response)}\n`);
  }
  child.stdin.end();
  return new Promise((resolve) => child.on("close", (code) => resolve(spawnError ? 1 : code || 0)));
}

export function toolCallFromMessage(message, { client = "mcp-client", server = "mcp-server" } = {}) {
  if (!message || typeof message !== "object") return null;
  if (!["tools/call", "tool/call", "mcp/tool/call"].includes(message.method)) return null;
  const params = message.params || {};
  const tool = params.name || params.tool || params.toolName;
  if (!tool) return null;
  return {
    tool,
    input: params.arguments || params.input || {},
    client,
    server
  };
}

function defaultIo() {
  return {
    stdout: (text) => process.stdout.write(text),
    stderr: (text) => process.stderr.write(text)
  };
}
