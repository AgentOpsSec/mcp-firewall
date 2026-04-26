import path from "node:path";
import { loadState, saveState } from "./state.js";
import { fileExists, readJson } from "./utils.js";

export async function addConfig(configPath, cwd = process.cwd()) {
  const absolutePath = path.resolve(cwd, configPath);
  if (!(await fileExists(absolutePath))) {
    throw new Error(`MCP config not found: ${absolutePath}`);
  }
  const data = await readJson(absolutePath);
  const servers = Object.keys(data.mcpServers || data.servers || {});
  const state = await loadState(cwd);
  const existing = state.configs.find((config) => config.path === absolutePath);
  const entry = {
    path: absolutePath,
    addedAt: new Date().toISOString(),
    servers
  };
  if (existing) Object.assign(existing, entry);
  else state.configs.push(entry);
  await saveState(state, cwd);
  return entry;
}
