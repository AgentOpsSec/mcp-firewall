import path from "node:path";
import { DEFAULT_POLICY, POLICY_FILE } from "./constants.js";
import { fileExists, readJson, writeJson } from "./utils.js";

export async function initPolicy({ cwd = process.cwd(), force = false } = {}) {
  const policyPath = path.join(cwd, POLICY_FILE);
  if ((await fileExists(policyPath)) && !force) {
    throw new Error(`Policy already exists at ${policyPath}. Use --force to overwrite it.`);
  }
  await writeJson(policyPath, DEFAULT_POLICY);
  return policyPath;
}

export async function loadPolicy(cwd = process.cwd()) {
  const policyPath = path.join(cwd, POLICY_FILE);
  if (!(await fileExists(policyPath))) return DEFAULT_POLICY;
  return readJson(policyPath);
}

export function evaluateToolCall(policy, call) {
  const rules = Array.isArray(policy.rules) ? policy.rules : [];
  const matched = rules
    .filter((rule) => ruleMatches(rule, call))
    .sort((left, right) => ruleScore(right, call) - ruleScore(left, call))[0];
  const action = matched?.action || policy.defaultAction || "warn";
  return {
    action,
    policyMatched: matched?.id || matched?.tool || "default",
    risk: riskForCall(call, action),
    reason: reasonForCall(call, action)
  };
}

export function applyApprovals(decision, call, approvals = []) {
  const target = approvalTarget(decision, call);
  const approved = approvals.find((approval) => {
    return approval.target === "*" ||
      approval.target === target ||
      approval.target === call.tool ||
      approval.target === decision.policyMatched ||
      approval.target === `${call.server || "unknown"}:${call.tool}`;
  });
  if (!approved) return decision;
  return {
    ...decision,
    action: "allow",
    policyMatched: `approval:${approved.target}`,
    reason: `Approved for ${approved.scope || "project"} at ${approved.approvedAt || "unknown time"}.`
  };
}

export function approvalTarget(decision, call) {
  return decision.policyMatched && decision.policyMatched !== "default"
    ? decision.policyMatched
    : call.tool;
}

function ruleMatches(rule, call) {
  if (rule.tool && rule.tool !== call.tool) return false;
  if (rule.scope && !scopeMatches(rule.scope, call.input || {})) return false;
  if (rule.command && rule.command !== call.input?.command) return false;
  return true;
}

function ruleScore(rule, call) {
  let score = 0;
  if (rule.tool) score += 10;
  if (rule.command) score += 100 + String(rule.command).length;
  if (rule.scope) score += 100 + normalizedScope(rule.scope).length;
  score += actionPriority(rule.action);
  if (ruleMatches(rule, call) && rule.scope === "./") score -= 50;
  return score;
}

function actionPriority(action) {
  if (action === "block") return 4;
  if (action === "approve" || action === "ask") return 3;
  if (action === "warn") return 2;
  if (action === "allow") return 1;
  return 0;
}

function scopeMatches(scope, input) {
  const candidates = [
    input.path,
    input.scope,
    input.file,
    input.filePath,
    input.root,
    input.directory
  ].filter(Boolean);
  if (candidates.length === 0) return false;
  const expected = normalizedScope(scope);
  return candidates.some((candidate) => {
    const actual = normalizedScope(candidate);
    if (expected === ".") {
      return !actual.startsWith("~") && !actual.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(actual);
    }
    if (expected === ".env") {
      return actual === ".env" || actual.startsWith(".env.") || actual.startsWith(".env/");
    }
    return actual === expected || actual.startsWith(`${expected}/`);
  });
}

function normalizedScope(value) {
  return String(value || "")
    .replace(/\\/g, "/")
    .replace(/\/+$/g, "")
    .replace(/^\.\//, "")
    || ".";
}

function riskForCall(call, action) {
  if (/\.env|\.ssh|secret|credential/i.test(JSON.stringify(call.input || {}))) return "critical";
  if (action === "block") return "high";
  if (call.tool === "shell.exec") return "high";
  if (/write|delete|send|create|update/i.test(call.tool)) return "medium";
  return "low";
}

function reasonForCall(call, action) {
  if (action === "block") return "Policy blocks this tool call.";
  if (call.tool === "shell.exec") return "Shell commands can mutate files or expose data.";
  if (/\.env|\.ssh|secret|credential/i.test(JSON.stringify(call.input || {}))) return "Input references sensitive paths or credentials.";
  return "Policy allows or warns on this tool call.";
}
