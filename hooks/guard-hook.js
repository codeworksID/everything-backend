#!/usr/bin/env node
"use strict";

// Claude Code PreToolUse hook for the everything-backend plugin.
//
// Reads the hook JSON from stdin. For Bash and PowerShell it classifies
// tool_input.command with _shared/scripts/guard.js. For Write, Edit and
// MultiEdit it checks whether tool_input.file_path is a secret file, then
// scans the added text with _shared/scripts/security-scan.js.
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

// Text the edit would add: Write content, Edit new_string, MultiEdit new_strings.
function addedText(toolName, toolInput) {
  if (toolName === "Write") return typeof toolInput.content === "string" ? toolInput.content : "";
  if (toolName === "Edit") return typeof toolInput.new_string === "string" ? toolInput.new_string : "";
  if (toolName === "MultiEdit" && Array.isArray(toolInput.edits)) {
    return toolInput.edits.map((e) => (e && typeof e.new_string === "string" ? e.new_string : "")).join("\n");
  }
  return "";
}

// Runs _shared/scripts/security-scan.js over the added text. Default mode asks on
// high and critical findings; strict mode also on medium. Snippets are never
// included, so a secret in the new text is not echoed back.
function insecureCodeReason(toolName, toolInput, mode) {
  const filePath = typeof toolInput.file_path === "string" ? toolInput.file_path : "";
  const text = addedText(toolName, toolInput);
  if (!filePath || !text.trim()) return null;
  const scan = require(path.join(__dirname, "..", ".agents", "skills", "_shared", "scripts", "security-scan.js"));
  const rel = filePath.replace(/\\/g, "/");
  if (scan.isVendored(rel, text) || scan.ignoreFileReason(text)) return null;
  const min = scan.SEVERITIES.indexOf(mode === "strict" ? "medium" : "high");
  const hits = scan.scanText(text, rel).filter((f) => scan.SEVERITIES.indexOf(f.severity) >= min);
  if (hits.length === 0) return null;
  const shown = hits.slice(0, 3).map((f) => `[${f.rule}] ${f.severity}, line ${f.line} of the new text: ${f.message} (${f.ref})`);
  const more = hits.length > 3 ? `; and ${hits.length - 3} more` : "";
  return `insecure-code: ${shown.join("; ")}${more}. Fix it per _shared/secure-coding.md, or confirm it was reviewed (suppress with "security-scan: ignore <rule-id> <reason>")`;
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
    return insecureCodeReason(toolName, toolInput, mode);
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

module.exports = { isSecretFile, decide, insecureCodeReason };
