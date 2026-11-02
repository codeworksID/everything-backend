#!/usr/bin/env node
"use strict";

// Claude Code PreToolUse hook for the everything-backend plugin.
//
// Reads the hook JSON from stdin. For Bash and PowerShell it classifies
// tool_input.command with _shared/scripts/guard.js. For Write, Edit and
// MultiEdit it checks whether tool_input.file_path is a secret file.
// When something needs a human, it prints a PreToolUse "ask" decision.
// When it has no objection, it prints nothing (the host's normal permissions apply).
//
// EVERYTHING_BACKEND_GUARD=off disables the hook; =strict enables strict mode.
// The hook never blocks or crashes a session: on any internal error it prints
// nothing and exits 0.

const path = require("node:path");

const SHELL_TOOLS = { Bash: "bash", PowerShell: "powershell" };
const EDIT_TOOLS = new Set(["Write", "Edit", "MultiEdit"]);
const ENV_ALLOWED = new Set([".env.example", ".env.sample", ".env.template"]);

function isSecretFile(filePath) {
  if (typeof filePath !== "string" || !filePath) return false;
  const base = path.basename(filePath.replace(/\\/g, "/")).toLowerCase();
  if (ENV_ALLOWED.has(base)) return false;
  if (base === ".env" || base.startsWith(".env.")) return true;
  if (base.endsWith(".pem") || base.endsWith(".key")) return true;
  // SSH private keys of every common type; the .pub halves are public.
  if (/^id_(rsa|dsa|ecdsa|ed25519)(_sk)?$/.test(base)) return true;
  if (base.startsWith("credentials") && base.endsWith(".json")) return true;
  return false;
}

function ask(reason) {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "ask",
        permissionDecisionReason: `everything-backend guard: ${reason}`,
      },
    }) + "\n"
  );
}

function decide(input) {
  const setting = String(process.env.EVERYTHING_BACKEND_GUARD || "").trim().toLowerCase();
  if (setting === "off") return null;
  const mode = setting === "strict" ? "strict" : "default";

  if (!input || typeof input !== "object") return null;
  const toolName = input.tool_name;
  const toolInput = input.tool_input || {};

  if (EDIT_TOOLS.has(toolName)) {
    if (isSecretFile(toolInput.file_path)) {
      return `editing a secret file (${path.basename(String(toolInput.file_path).replace(/\\/g, "/"))}); keep secrets out of the repo and the transcript`;
    }
    return null;
  }

  const shell = SHELL_TOOLS[toolName];
  if (!shell || typeof toolInput.command !== "string" || !toolInput.command.trim()) return null;

  const guard = require(path.join(__dirname, "..", ".agents", "skills", "_shared", "scripts", "guard.js"));
  const result = guard.classify(toolInput.command, { shell, mode });
  if (result && result.decision === "ask") {
    const parts = [result.category, result.reason].filter(Boolean);
    return parts.join(": ") || "command needs confirmation";
  }
  return null;
}

function run(raw) {
  try {
    const reason = decide(raw.trim() ? JSON.parse(raw) : null);
    if (reason) ask(reason);
  } catch {
    // Never break the session: no output means no decision.
  }
  process.exitCode = 0;
}

if (require.main === module) {
  let raw = "";
  try {
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      raw += chunk;
    });
    process.stdin.on("end", () => run(raw));
    process.stdin.on("error", () => {
      process.exitCode = 0;
    });
  } catch {
    process.exitCode = 0;
  }
}

module.exports = { isSecretFile, decide };
