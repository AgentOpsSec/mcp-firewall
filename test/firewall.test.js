import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { main } from "../src/cli.js";
import { applyApprovals, evaluateToolCall } from "../src/policy.js";
import { evaluateJsonRpcMessage } from "../src/proxy.js";

function io() {
  let output = "";
  let exitCode = 0;
  return {
    api: {
      stdout: (text) => { output += text; },
      stderr: (text) => { output += text; },
      setExitCode: (code) => { exitCode = code; }
    },
    get output() { return output; },
    get exitCode() { return exitCode; }
  };
}

test("policy blocks sensitive filesystem reads", () => {
  const decision = evaluateToolCall({
    defaultAction: "warn",
    rules: [{ id: "block-env", tool: "filesystem.read", scope: ".env", action: "block" }]
  }, {
    tool: "filesystem.read",
    input: { path: ".env" }
  });
  assert.equal(decision.action, "block");
});

test("default policy lets specific secret blocks override broad project allows", () => {
  const decision = evaluateToolCall({
    defaultAction: "warn",
    rules: [
      { id: "allow-project-files", tool: "filesystem.read", scope: "./", action: "allow" },
      { id: "block-env", tool: "filesystem.read", scope: ".env", action: "block" }
    ]
  }, {
    tool: "filesystem.read",
    input: { path: ".env.local" }
  });
  assert.equal(decision.action, "block");
  assert.equal(decision.policyMatched, "block-env");
});

test("approvals override matching policy decisions", () => {
  const call = { tool: "filesystem.read", input: { path: ".env" } };
  const decision = evaluateToolCall({
    defaultAction: "warn",
    rules: [{ id: "block-env", tool: "filesystem.read", scope: ".env", action: "block" }]
  }, call);
  assert.equal(applyApprovals(decision, call, [{ target: "block-env" }]).action, "allow");
});

test("JSON-RPC proxy blocks tool calls before forwarding", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mcp-firewall-proxy-"));
  const result = await evaluateJsonRpcMessage({
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: { name: "filesystem.read", arguments: { path: ".env" } }
  }, {
    cwd,
    policy: {
      defaultAction: "warn",
      rules: [{ id: "block-env", tool: "filesystem.read", scope: ".env", action: "block" }]
    }
  });
  assert.equal(result.allowed, false);
  assert.equal(result.response.error.code, -32001);
});

test("init, add, check, and logs work end to end", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mcp-firewall-"));
  const configPath = path.join(cwd, "mcp.json");
  await fs.promises.writeFile(configPath, JSON.stringify({ mcpServers: { filesystem: { command: "npx" } } }), "utf8");

  let session = io();
  await main(["init", "--cwd", cwd], session.api);
  assert.match(session.output, /MCP Firewall Init by github\.com\/AgentOpsSec/);

  session = io();
  await main(["add", configPath, "--cwd", cwd], session.api);
  assert.match(session.output, /filesystem/);

  session = io();
  await main(["check", "--cwd", cwd, "--tool", "shell.exec", "--input", "{\"command\":\"npm test\"}"], session.api);
  assert.match(session.output, /MCP Firewall Decision by github\.com\/AgentOpsSec/);
  assert.match(session.output, /Action: allow/);

  session = io();
  await main(["logs", "--cwd", cwd], session.api);
  assert.match(session.output, /MCP Firewall Logs by github\.com\/AgentOpsSec/);

  session = io();
  await main(["run", "codex", "--dry-run", "--cwd", cwd], session.api);
  assert.match(session.output, /MCP Firewall Run by github\.com\/AgentOpsSec/);
});

test("imports MCP Doctor scan reports without requiring MCP Doctor code", async () => {
  const cwd = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mcp-firewall-doctor-"));
  const reportPath = path.join(cwd, "doctor-report.json");
  await fs.promises.writeFile(reportPath, JSON.stringify({
    tool: {
      name: "MCP Doctor",
      by: "github.com/AgentOpsSec",
      repository: "github.com/AgentOpsSec/mcp-doctor"
    },
    summary: { highestRisk: "high" },
    configs: [{ path: "/tmp/mcp.json", label: "test", serverCount: 2 }],
    findings: [{ risk: "high" }, { risk: "medium" }]
  }), "utf8");
  const session = io();
  await main(["import-doctor", reportPath, "--cwd", cwd], session.api);
  assert.match(session.output, /MCP Firewall Import by github\.com\/AgentOpsSec/);
  assert.match(session.output, /Configs imported: 1/);
  assert.match(session.output, /Highest risk: high/);
});
