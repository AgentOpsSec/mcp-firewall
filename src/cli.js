import { spawn } from "node:child_process";
import path from "node:path";
import { brandedTitle, TOOL, VERSION } from "./constants.js";
import { addConfig } from "./config.js";
import { applyApprovals, evaluateToolCall, initPolicy, loadPolicy } from "./policy.js";
import { evaluateJsonRpcMessage, proxyJsonLines } from "./proxy.js";
import { appendLog, initState, loadState, readLogs, saveState } from "./state.js";
import { amber, dim, green, paint, red, risk as paintRisk, setColor, shouldColor } from "./tui.js";
import { updateOne } from "./updater.js";
import { nowIso, parseArgs, readJson, stringify } from "./utils.js";

const PACKAGE_NAME = "@agentopssec/mcp-firewall";

async function runUpdate(args, io) {
  const { flags } = parseArgs(args);
  await updateOne({
    packageName: PACKAGE_NAME,
    currentVersion: VERSION,
    title: brandedTitle("Update"),
    color: { amber, green },
    io,
    yes: Boolean(flags.yes || flags.y)
  });
}

export async function main(argv = process.argv.slice(2), io = defaultIo()) {
  const command = argv[0] || "help";
  const args = argv.slice(1);
  if (["help", "--help", "-h"].includes(command)) return io.stdout(help());
  if (["version", "--version", "-v"].includes(command)) return io.stdout(`mcp-firewall ${VERSION}\n`);
  if (command === "init") return runInit(args, io);
  if (command === "add") return runAdd(args, io);
  if (command === "run") return runRun(args, io);
  if (command === "logs") return runLogs(args, io);
  if (command === "approve") return runApprove(args, io);
  if (command === "policy") return runPolicy(args, io);
  if (command === "check") return runCheck(args, io);
  if (command === "proxy") return runProxy(args, io);
  if (command === "import-doctor") return runImportDoctor(args, io);
  if (command === "update" || command === "--update") return runUpdate(args, io);
  throw new Error(`Unknown command "${command}".`);
}

async function runInit(args, io) {
  const { flags } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const stateFile = await initState(cwd);
  const policyFile = await initPolicy({ cwd, force: Boolean(flags.force) }).catch((error) => {
    if (String(error.message).includes("already exists")) return path.join(cwd, "mcp-firewall.policy.json");
    throw error;
  });
  const result = { tool: TOOL, stateFile, policyFile };
  io.stdout(flags.json ? stringify(result) : `${brandedTitle("Init")}\n\nState: ${stateFile}\nPolicy: ${policyFile}\n`);
}

async function runAdd(args, io) {
  const { flags, positional } = parseArgs(args);
  if (!positional[0]) throw new Error("add requires an MCP config path.");
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const entry = await addConfig(positional[0], cwd);
  await appendLog({ timestamp: nowIso(), type: "config.add", action: "allow", config: entry }, cwd);
  const result = { tool: TOOL, config: entry };
  io.stdout(flags.json ? stringify(result) : `${brandedTitle("Add")}\n\nRegistered: ${entry.path}\nServers: ${entry.servers.join(", ") || "none"}\n`);
}

async function runRun(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const client = positional[0];
  if (!client) throw new Error("run requires a client command, for example: mcp-firewall run codex");
  const clientArgs = positional.slice(1);
  const state = await loadState(cwd);
  const entry = {
    timestamp: nowIso(),
    type: "run",
    client,
    clientArgs,
    projectPath: cwd,
    registeredConfigs: state.configs.length,
    action: "allow"
  };
  await appendLog(entry, cwd);
  io.stdout(`${brandedTitle("Run")}\n\nClient: ${client}\nRegistered configs: ${state.configs.length}\n`);
  if (flags["dry-run"] || clientArgs.length === 0) return;
  const exitCode = await spawnCommand(client, clientArgs, cwd, io);
  io.setExitCode(exitCode);
}

async function runLogs(args, io) {
  const { flags } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const logs = await readLogs(cwd);
  const limit = Number(flags.limit || 20);
  const latest = logs.slice(-limit);
  if (flags.json) return io.stdout(stringify({ tool: TOOL, logs: latest }));
  const lines = [brandedTitle("Logs"), ""];
  if (latest.length === 0) lines.push(dim("No firewall logs found."));
  for (const log of latest) {
    const action = log.action || "";
    const colored = action ? paintRisk(action, action) : "";
    lines.push(`- ${dim(log.timestamp || "unknown")} ${log.type || log.toolCall?.tool || "event"} ${colored}`.trim());
  }
  io.stdout(`${lines.join("\n")}\n`);
}

async function runApprove(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  let target = positional[0] || "latest";
  const state = await loadState(cwd);
  if (target === "latest") {
    const latest = (await readLogs(cwd)).at(-1);
    target = latest?.policyMatched || latest?.toolCall?.tool || latest?.type || "latest";
  }
  const approval = { target, approvedAt: nowIso(), action: "approve_for_project", scope: flags.scope || "project" };
  state.approvals.push(approval);
  await saveState(state, cwd);
  await appendLog({ timestamp: nowIso(), type: "approval", action: "approve_for_project", target }, cwd);
  io.stdout(flags.json ? stringify({ tool: TOOL, approval }) : `${brandedTitle("Approval")}\n\nApproved: ${target}\n`);
}

async function runPolicy(args, io) {
  const subcommand = args[0] || "help";
  const rest = args.slice(1);
  const { flags } = parseArgs(rest);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  if (subcommand === "init") {
    const policyFile = await initPolicy({ cwd, force: Boolean(flags.force) });
    return io.stdout(flags.json ? stringify({ tool: TOOL, policyFile }) : `${brandedTitle("Policy")}\n\nCreated policy at ${policyFile}\n`);
  }
  if (subcommand === "show") {
    const policy = await loadPolicy(cwd);
    return io.stdout(flags.json ? stringify({ tool: TOOL, policy }) : `${brandedTitle("Policy")}\n\n${JSON.stringify(policy, null, 2)}\n`);
  }
  io.stdout(policyHelp());
}

async function runCheck(args, io) {
  const { flags } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const tool = flags.tool;
  if (!tool) throw new Error("check requires --tool.");
  const input = flags.input ? JSON.parse(flags.input) : {};
  const policy = await loadPolicy(cwd);
  const state = await loadState(cwd);
  const call = {
    tool,
    input,
    client: flags.client || "unknown",
    server: flags.server || "unknown"
  };
  const decision = applyApprovals(evaluateToolCall(policy, call), call, state.approvals || []);
  const entry = {
    eventId: `evt_${Date.now()}`,
    timestamp: nowIso(),
    type: "tool-call",
    client: flags.client || "unknown",
    server: flags.server || "unknown",
    toolCall: { tool, input },
    ...decision
  };
  await appendLog(entry, cwd);
  const result = { tool: TOOL, decision: entry };
  if (flags.json) return io.stdout(stringify(result));
  io.stdout(`${brandedTitle("Decision")}\n\nTool: ${tool}\nAction: ${paintRisk(decision.action, decision.action)}\nRisk: ${paintRisk(decision.risk, decision.risk)}\nPolicy: ${decision.policyMatched}\nReason: ${decision.reason}\n`);
  if (decision.action === "block") io.setExitCode(2);
}

async function runProxy(args, io) {
  const { flags, positional } = parseArgs(args);
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  // parseArgs already consumes `--` and pushes everything after it into positional.
  const commandParts = positional;
  const policy = await loadPolicy(cwd);
  if (flags.check) {
    let message;
    try {
      message = JSON.parse(flags.check);
    } catch (error) {
      throw new Error(`--check value must be valid JSON: ${error.message}`);
    }
    const state = await loadState(cwd);
    const result = await evaluateJsonRpcMessage(message, {
      policy,
      approvals: state.approvals || [],
      cwd,
      client: flags.client || "mcp-client",
      server: flags.server || commandParts[0] || "mcp-server"
    });
    const actionWord = result.decision?.action || "allow";
    return io.stdout(flags.json ? stringify(result) : `${brandedTitle("Proxy Check")}\n\nAction: ${paintRisk(actionWord, actionWord)}\nAllowed: ${result.allowed ? green("yes") : red("no")}\n`);
  }
  if (commandParts.length === 0) throw new Error("proxy requires a server command after --.");
  const exitCode = await proxyJsonLines({
    command: commandParts[0],
    args: commandParts.slice(1),
    cwd,
    policy,
    client: flags.client || "mcp-client",
    server: flags.server || commandParts[0],
    io
  });
  io.setExitCode(exitCode);
}

async function runImportDoctor(args, io) {
  const { flags, positional } = parseArgs(args);
  if (!positional[0]) throw new Error("import-doctor requires an MCP Doctor scan JSON file.");
  const cwd = flags.cwd ? path.resolve(flags.cwd) : process.cwd();
  const reportPath = path.resolve(cwd, positional[0]);
  const report = await readJson(reportPath);
  const state = await loadState(cwd);
  const configs = (report.configs || []).filter((config) => config.path);
  for (const config of configs) {
    const existing = state.configs.find((entry) => entry.path === config.path);
    const imported = {
      path: config.path,
      addedAt: nowIso(),
      source: "mcp-doctor",
      label: config.label,
      serverCount: config.serverCount
    };
    if (existing) Object.assign(existing, imported);
    else state.configs.push(imported);
  }
  await saveState(state, cwd);
  const entry = {
    timestamp: nowIso(),
    type: "mcp-doctor.import",
    action: "log_only",
    reportPath,
    configsImported: configs.length,
    findingsImported: report.findings?.length || 0,
    highestRisk: report.summary?.highestRisk || "unknown"
  };
  await appendLog(entry, cwd);
  const result = { tool: TOOL, import: entry };
  if (flags.json) return io.stdout(stringify(result));
  io.stdout([
    brandedTitle("Import"),
    "",
    `Source: ${reportPath}`,
    `Configs imported: ${entry.configsImported}`,
    `Findings referenced: ${entry.findingsImported}`,
    `Highest risk: ${paintRisk(entry.highestRisk, entry.highestRisk)}`
  ].join("\n") + "\n");
}

function spawnCommand(command, args, cwd, io) {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd, stdio: "inherit" });
    child.on("error", (error) => {
      io.stderr?.(`${error.message}\n`);
      resolve(1);
    });
    child.on("close", (code) => resolve(code || 0));
  });
}

function help() {
  return [
    brandedTitle(),
    "",
    "Usage:",
    "  mcp-firewall init",
    "  mcp-firewall add ./mcp.json",
    "  mcp-firewall run codex --dry-run",
    "  mcp-firewall policy init",
    "  mcp-firewall check --tool shell.exec --input '{\"command\":\"npm test\"}'",
    "  mcp-firewall proxy -- node ./server.js",
    "  mcp-firewall import-doctor mcp-doctor-scan.json",
    "  mcp-firewall logs",
    "  mcp-firewall approve latest",
    "  mcp-firewall update [--yes]"
  ].join("\n") + "\n";
}

function policyHelp() {
  return [
    brandedTitle("Policy"),
    "",
    "Usage:",
    "  mcp-firewall policy init [--force]",
    "  mcp-firewall policy show [--json]"
  ].join("\n") + "\n";
}

function defaultIo() {
  setColor(shouldColor(process.stdout));
  return {
    stdout: (text) => process.stdout.write(paint(text)),
    stderr: (text) => process.stderr.write(paint(text)),
    setExitCode: (code) => {
      process.exitCode = code;
    }
  };
}
