export const BRAND = "github.com/AgentOpsSec";
export const VERSION = "1.0.0";
export const REPOSITORY = "github.com/AgentOpsSec/mcp-firewall";
export const TOOL = {
  name: "MCP Firewall",
  by: BRAND,
  repository: REPOSITORY
};

export function brandedTitle(label = "") {
  return ["MCP Firewall", label, `by ${BRAND}`].filter(Boolean).join(" ");
}

export const STATE_DIR = ".mcp-firewall";
export const STATE_FILE = ".mcp-firewall/config.json";
export const LOG_FILE = ".mcp-firewall/logs.jsonl";
export const POLICY_FILE = "mcp-firewall.policy.json";

export const DEFAULT_POLICY = {
  project: "local-project",
  defaultAction: "warn",
  rules: [
    {
      id: "allow-project-files",
      tool: "filesystem.read",
      scope: "./",
      action: "allow"
    },
    {
      id: "block-ssh",
      tool: "filesystem.read",
      scope: "~/.ssh",
      action: "block"
    },
    {
      id: "block-env",
      tool: "filesystem.read",
      scope: ".env",
      action: "block"
    },
    {
      id: "allow-tests",
      tool: "shell.exec",
      command: "npm test",
      action: "allow"
    },
    {
      id: "warn-shell",
      tool: "shell.exec",
      action: "warn"
    }
  ]
};

export const RISK_WEIGHT = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4
};
