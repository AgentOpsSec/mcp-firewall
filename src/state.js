import fs from "node:fs";
import path from "node:path";
import { LOG_FILE, POLICY_FILE, STATE_DIR, STATE_FILE, TOOL } from "./constants.js";
import { ensureDir, fileExists, nowIso, readJson, writeJson } from "./utils.js";

export function paths(cwd = process.cwd()) {
  return {
    stateDir: path.join(cwd, STATE_DIR),
    stateFile: path.join(cwd, STATE_FILE),
    logFile: path.join(cwd, LOG_FILE),
    policyFile: path.join(cwd, POLICY_FILE)
  };
}

export async function initState(cwd = process.cwd()) {
  const p = paths(cwd);
  await ensureDir(p.stateDir);
  if (!(await fileExists(p.stateFile))) {
    await writeJson(p.stateFile, {
      schemaVersion: "1.0",
      tool: TOOL,
      createdAt: nowIso(),
      configs: [],
      approvals: []
    });
  }
  return p.stateFile;
}

export async function loadState(cwd = process.cwd()) {
  await initState(cwd);
  return readJson(paths(cwd).stateFile);
}

export async function saveState(state, cwd = process.cwd()) {
  await writeJson(paths(cwd).stateFile, state);
}

export async function appendLog(entry, cwd = process.cwd()) {
  const p = paths(cwd);
  await ensureDir(path.dirname(p.logFile));
  const line = JSON.stringify({ schemaVersion: "1.0", tool: TOOL, ...entry });
  await fs.promises.appendFile(p.logFile, `${line}\n`, "utf8");
}

export async function readLogs(cwd = process.cwd()) {
  const p = paths(cwd);
  if (!(await fileExists(p.logFile))) return [];
  const raw = await fs.promises.readFile(p.logFile, "utf8");
  const logs = [];
  for (const line of raw.split(/\r?\n/).filter(Boolean)) {
    try {
      logs.push(JSON.parse(line));
    } catch {
      // Ignore corrupt local log lines so one partial append does not break the CLI.
    }
  }
  return logs;
}
