#!/usr/bin/env node
"use strict";

// everything-backend checkpoint tool.
// Records what a skill run changed so the run can be resumed or rolled back
// without touching the user's own work. Node >= 18, no dependencies,
// works on Windows, macOS and Linux. Run it from the project root.
//
// Contract: _shared/tool-rules.md -> Concurrent & Partial Work.
//
// Usage:
//   checkpoint.js start    --skill S --feature F [--steps "a,b,c"] [--restart]
//   checkpoint.js backup   --skill S --feature F <file...>
//   checkpoint.js record   --skill S --feature F [--created a,b] [--modified c,d] [--done step] [--memory file]
//   checkpoint.js snapshot --skill S --feature F
//   checkpoint.js status   [--skill S] [--feature F] [--all] [--json]
//   checkpoint.js rollback --skill S --feature F [--dry-run] [--restore-backups] [--delete-created]
//   checkpoint.js close    --skill S --feature F [--status completed|abandoned]
// Every command also accepts --json (machine output) and --id <id> (target a specific checkpoint).
// Exit codes: 0 ok, 1 error, 2 usage, 3 an open checkpoint already exists.

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const MEMORY_DIR = ".opencode/everything-backend-memory";
const CHECKPOINT_DIR = MEMORY_DIR + "/.checkpoints";
const SLUG_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*-\d{8}T\d{6}Z$/;
const STATUSES = ["open", "completed", "abandoned"];

const EXIT_OK = 0;
const EXIT_ERROR = 1;
const EXIT_USAGE = 2;
const EXIT_OPEN_EXISTS = 3;

class CliError extends Error {
  constructor(message, code) {
    super(message);
    this.exitCode = code === undefined ? EXIT_ERROR : code;
  }
}

const USAGE = [
  "Usage: node checkpoint.js <command> [options]",
  "",
  "Commands:",
  "  start    --skill S --feature F [--steps \"a,b,c\"] [--restart]",
  "  backup   --skill S --feature F <file...>",
  "  record   --skill S --feature F [--created a,b] [--modified c,d] [--done step] [--memory file]",
  "  snapshot --skill S --feature F",
  "  status   [--skill S] [--feature F] [--all] [--json]",
  "  rollback --skill S --feature F [--dry-run] [--restore-backups] [--delete-created]",
  "  close    --skill S --feature F [--status completed|abandoned]",
  "",
  "Common options: --json (machine-readable output), --id <checkpoint-id>.",
  "Run from the project root. Exit codes: 0 ok, 1 error, 2 usage, 3 open checkpoint exists.",
].join("\n");

// ---------------------------------------------------------------------------
// Argument parsing

const BOOLEAN_FLAGS = new Set(["restart", "json", "dry-run", "restore-backups", "delete-created", "all", "help"]);
const VALUE_FLAGS = new Set(["skill", "feature", "steps", "created", "modified", "done", "memory", "status", "id"]);
const REPEATABLE = new Set(["created", "modified", "done", "memory"]);

function parseArgs(argv) {
  const out = { command: null, flags: {}, positionals: [] };
  let i = 0;
  let endOfOptions = false;
  while (i < argv.length) {
    const arg = argv[i];
    if (!endOfOptions && arg === "--") {
      endOfOptions = true;
      i += 1;
      continue;
    }
    if (!endOfOptions && arg.startsWith("--") && arg.length > 2) {
      let name = arg.slice(2);
      let value;
      const eq = name.indexOf("=");
      if (eq !== -1) {
        value = name.slice(eq + 1);
        name = name.slice(0, eq);
      }
      if (BOOLEAN_FLAGS.has(name)) {
        if (value !== undefined) throw new CliError("--" + name + " does not take a value", EXIT_USAGE);
        out.flags[name] = true;
        i += 1;
        continue;
      }
      if (!VALUE_FLAGS.has(name)) throw new CliError("Unknown option --" + name, EXIT_USAGE);
      if (value === undefined) {
        if (i + 1 >= argv.length) throw new CliError("--" + name + " needs a value", EXIT_USAGE);
        value = argv[i + 1];
        i += 2;
      } else {
        i += 1;
      }
      if (REPEATABLE.has(name)) {
        (out.flags[name] = out.flags[name] || []).push(value);
      } else {
        out.flags[name] = value;
      }
      continue;
    }
    if (!endOfOptions && arg === "-h") {
      out.flags.help = true;
      i += 1;
      continue;
    }
    if (out.command === null) out.command = arg;
    else out.positionals.push(arg);
    i += 1;
  }
  return out;
}

function splitList(values) {
  const list = [];
  for (const v of values || []) {
    for (const part of String(v).split(",")) {
      const t = part.trim();
      if (t) list.push(t);
    }
  }
  return list;
}

function requireSlug(flags, name) {
  const value = flags[name];
  if (value === undefined || value === "") throw new CliError("--" + name + " is required", EXIT_USAGE);
  if (!SLUG_RE.test(value)) {
    throw new CliError("--" + name + " must be a slug of lowercase letters, digits and single hyphens (got \"" + value + "\")", EXIT_USAGE);
  }
  return value;
}

function optionalSlug(flags, name) {
  if (flags[name] === undefined) return undefined;
  return requireSlug(flags, name);
}

// ---------------------------------------------------------------------------
// Helpers

function toPosix(p) {
  return p.split(path.sep).join("/").replace(/\\/g, "/");
}

function nowIso() {
  return new Date().toISOString();
}

function compactTimestamp(date) {
  // 2026-11-02T10:15:00.123Z -> 20261102T101500Z (no ':' so it is a valid Windows filename)
  return date.toISOString().replace(/\.\d+Z$/, "Z").replace(/[-:]/g, "");
}

function runGit(root, args, options) {
  const res = spawnSync("git", args, {
    cwd: root,
    encoding: options && options.buffer ? "buffer" : "utf8",
    input: options && options.input !== undefined ? options.input : undefined,
    maxBuffer: 256 * 1024 * 1024,
    windowsHide: true,
  });
  if (res.error) return { status: -1, stdout: options && options.buffer ? Buffer.alloc(0) : "", stderr: String(res.error.message) };
  return { status: res.status, stdout: res.stdout, stderr: res.stderr ? res.stderr.toString() : "" };
}

function detectGit(root) {
  const inside = runGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside.status !== 0 || String(inside.stdout).trim() !== "true") return null;
  const top = runGit(root, ["rev-parse", "--show-toplevel"]);
  const prefix = runGit(root, ["rev-parse", "--show-prefix"]);
  if (top.status !== 0) return null;
  const head = runGit(root, ["rev-parse", "--verify", "--quiet", "HEAD"]);
  let base = "HEAD";
  if (head.status !== 0) {
    // Repository without commits: diff against the empty tree.
    const empty = runGit(root, ["hash-object", "-t", "tree", "--stdin"], { input: "" });
    base = String(empty.stdout).trim() || "4b825dc642cb6eb9a060e54bf8d69288fbee4904";
  }
  return {
    toplevel: path.resolve(String(top.stdout).trim()),
    prefix: String(prefix.stdout || "").trim(), // e.g. "services/api/" or ""
    base,
  };
}

function gitPorcelain(root, git) {
  const res = runGit(root, [
    "status",
    "--porcelain",
    "-z",
    "--untracked-files=all",
    "--",
    ".",
    ":(exclude)" + MEMORY_DIR,
  ]);
  if (res.status !== 0) throw new CliError("git status failed: " + res.stderr.trim());
  const parts = String(res.stdout).split("\0");
  const files = [];
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i];
    if (!entry || entry.length < 4) continue;
    const xy = entry.slice(0, 2);
    let file = entry.slice(3);
    if (xy[0] === "R" || xy[0] === "C") i += 1; // skip the original path of a rename or copy
    if (git.prefix && file.startsWith(git.prefix)) file = file.slice(git.prefix.length);
    files.push(file);
  }
  return Array.from(new Set(files)).sort();
}

function relInside(root, input) {
  if (typeof input !== "string" || input.trim() === "") throw new CliError("Empty path");
  const abs = path.resolve(root, input.trim());
  const rel = path.relative(root, abs);
  if (rel === "" || rel === ".") throw new CliError("Path \"" + input + "\" is the project root, not a file");
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new CliError("Refusing path outside the project root: " + input);
  }
  return toPosix(rel);
}

function isUnder(file, list) {
  return list.some((p) => p === file || (p.endsWith("/") ? file.startsWith(p) : file.startsWith(p + "/")));
}

function addUnique(list, values) {
  for (const v of values) if (!list.includes(v)) list.push(v);
}

function writeJsonAtomic(file, data) {
  const tmp = file + ".tmp-" + process.pid;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + "\n");
  fs.renameSync(tmp, file);
}

// ---------------------------------------------------------------------------
// Checkpoint storage

function checkpointDir(root) {
  return path.join(root, ...CHECKPOINT_DIR.split("/"));
}

function loadAll(root) {
  const dir = checkpointDir(root);
  if (!fs.existsSync(dir)) return [];
  const list = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    try {
      const data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (!data || typeof data.id !== "string" || !data.skill || !data.feature) continue;
      // The id names files this tool writes and deletes; never trust one that could leave the directory.
      if (!ID_RE.test(data.id) || name !== data.id + ".json") {
        process.stderr.write("Warning: skipping checkpoint " + name + ": invalid id\n");
        continue;
      }
      list.push(data);
    } catch (err) {
      process.stderr.write("Warning: skipping unreadable checkpoint " + name + ": " + err.message + "\n");
    }
  }
  list.sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)) || b.id.localeCompare(a.id));
  return list;
}

function saveCheckpoint(root, cp) {
  cp.updated_at = nowIso();
  writeJsonAtomic(path.join(checkpointDir(root), cp.id + ".json"), cp);
}

function findCheckpoint(root, flags, opts) {
  const all = loadAll(root);
  if (flags.id) {
    const byId = all.find((c) => c.id === flags.id);
    if (!byId) throw new CliError("No checkpoint with id " + flags.id);
    return byId;
  }
  const skill = requireSlug(flags, "skill");
  const feature = requireSlug(flags, "feature");
  const matching = all.filter((c) => c.skill === skill && c.feature === feature);
  const open = matching.find((c) => c.status === "open");
  if (open) return open;
  if (opts && opts.allowClosed && matching.length > 0) return matching[0];
  throw new CliError("No open checkpoint for skill " + skill + " and feature " + feature + ". Run start first.");
}

// ---------------------------------------------------------------------------
// Output

function summarize(cp) {
  const lines = [];
  lines.push("Checkpoint " + cp.id + " [" + cp.status + "]");
  lines.push("  skill: " + cp.skill + "   feature: " + cp.feature + "   git: " + (cp.git ? "yes" : "no"));
  lines.push("  started: " + cp.started_at + "   updated: " + cp.updated_at);
  const show = (label, list) => {
    if (list && list.length) lines.push("  " + label + ": " + list.join(", "));
  };
  show("completed steps", cp.completed_steps);
  show("pending steps", cp.pending_steps);
  if (cp.pending_steps && cp.pending_steps.length) lines.push("  resume from: " + cp.pending_steps[0]);
  show("created files", cp.created_files);
  show("modified files", cp.modified_files);
  show("pre-existing changes", cp.pre_existing_changes);
  if (cp.backups && cp.backups.length) lines.push("  backups: " + cp.backups.map((b) => b.file).join(", "));
  if (cp.patch) lines.push("  patch: " + cp.patch);
  show("memory updates", cp.memory_updates);
  return lines.join("\n");
}

function emit(flags, data, text) {
  if (flags.json) process.stdout.write(JSON.stringify(data, null, 2) + "\n");
  else if (text) process.stdout.write(text + "\n");
}

function warn(msg) {
  process.stderr.write("Warning: " + msg + "\n");
}

// ---------------------------------------------------------------------------
// Commands

function cmdStart(root, flags) {
  const skill = requireSlug(flags, "skill");
  const feature = requireSlug(flags, "feature");
  const existing = loadAll(root).filter((c) => c.skill === skill && c.feature === feature && c.status === "open");
  if (existing.length && !flags.restart) {
    const cp = existing[0];
    emit(flags, { result: "open-checkpoint-exists", checkpoint: cp },
      summarize(cp) + "\n\nAn open checkpoint already exists for this skill and feature.\n" +
      "Resume it (continue from the first pending step) or run start again with --restart.");
    return EXIT_OPEN_EXISTS;
  }
  const dir = checkpointDir(root);
  fs.mkdirSync(dir, { recursive: true });
  for (const old of existing) {
    old.status = "abandoned";
    saveCheckpoint(root, old);
  }

  const git = detectGit(root);
  let pre = [];
  if (git) pre = gitPorcelain(root, git);

  let when = new Date();
  let id = skill + "-" + feature + "-" + compactTimestamp(when);
  while (fs.existsSync(path.join(dir, id + ".json"))) {
    when = new Date(when.getTime() + 1000);
    id = skill + "-" + feature + "-" + compactTimestamp(when);
  }
  const started = nowIso();
  const cp = {
    id,
    skill,
    feature,
    status: "open",
    started_at: started,
    updated_at: started,
    git: Boolean(git),
    pre_existing_changes: pre,
    completed_steps: [],
    pending_steps: splitList(flags.steps ? [flags.steps] : []),
    created_files: [],
    modified_files: [],
    backups: [],
    patch: null,
    memory_updates: [],
  };
  saveCheckpoint(root, cp);

  const notes = [];
  if (!git) notes.push("Not a git repository: back up each existing file before editing it (checkpoint.js backup).");
  if (pre.length) {
    const msg = "The working tree has " + pre.length + " pre-existing change(s); they are off-limits for rollback: " + pre.join(", ");
    warn(msg);
    notes.push("Back up any of these before editing them (checkpoint.js backup).");
  }
  if (existing.length) notes.push("Marked " + existing.length + " older open checkpoint(s) as abandoned.");
  emit(flags, { result: "started", checkpoint: cp, notes },
    "Started checkpoint " + id + "\n  file: " + CHECKPOINT_DIR + "/" + id + ".json" + (notes.length ? "\n  " + notes.join("\n  ") : ""));
  return EXIT_OK;
}

function cmdBackup(root, flags, positionals) {
  const cp = findCheckpoint(root, flags);
  if (!positionals.length) throw new CliError("backup needs at least one file", EXIT_USAGE);
  const files = positionals.map((p) => relInside(root, p));
  const saved = [];
  const skipped = [];
  for (const file of files) {
    const abs = path.join(root, file);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch (err) {
      throw new CliError("Cannot back up " + file + ": file does not exist (record new files with record --created)");
    }
    if (!stat.isFile()) throw new CliError("Cannot back up " + file + ": not a regular file");
    if (cp.backups.some((b) => b.file === file)) {
      skipped.push(file);
      continue; // keep the first copy: it holds the original content
    }
    const copyRel = CHECKPOINT_DIR + "/" + cp.id + ".backups/" + file;
    const copyAbs = path.join(root, ...copyRel.split("/"));
    fs.mkdirSync(path.dirname(copyAbs), { recursive: true });
    fs.copyFileSync(abs, copyAbs);
    cp.backups.push({ file, copy: copyRel });
    if (!cp.modified_files.includes(file) && !cp.created_files.includes(file)) cp.modified_files.push(file);
    saved.push(file);
  }
  saveCheckpoint(root, cp);
  const lines = [];
  if (saved.length) lines.push("Backed up: " + saved.join(", "));
  if (skipped.length) lines.push("Already backed up (original copy kept): " + skipped.join(", "));
  emit(flags, { result: "backed-up", saved, skipped, checkpoint: cp }, lines.join("\n"));
  return EXIT_OK;
}

function cmdRecord(root, flags) {
  const cp = findCheckpoint(root, flags);
  const created = splitList(flags.created).map((p) => relInside(root, p));
  const modified = splitList(flags.modified).map((p) => relInside(root, p));
  const done = splitList(flags.done);
  const memory = splitList(flags.memory).map((m) => toPosix(m));
  if (!created.length && !modified.length && !done.length && !memory.length) {
    throw new CliError("record needs at least one of --created, --modified, --done, --memory", EXIT_USAGE);
  }
  addUnique(cp.created_files, created);
  addUnique(cp.modified_files, modified.filter((f) => !cp.created_files.includes(f)));
  for (const step of done) {
    cp.pending_steps = cp.pending_steps.filter((s) => s !== step);
    addUnique(cp.completed_steps, [step]);
  }
  addUnique(cp.memory_updates, memory);

  const warnings = [];
  for (const f of modified) {
    const hasBackup = cp.backups.some((b) => b.file === f);
    if (!cp.git && !hasBackup) warnings.push(f + " has no backup; without git it cannot be rolled back");
    if (cp.git && isUnder(f, cp.pre_existing_changes) && !hasBackup) {
      warnings.push(f + " had uncommitted changes before the run and has no backup; it is excluded from the patch");
    }
  }
  warnings.forEach(warn);
  saveCheckpoint(root, cp);
  emit(flags, { result: "recorded", warnings, checkpoint: cp }, "Recorded in " + cp.id + (cp.pending_steps.length ? "\n  next step: " + cp.pending_steps[0] : ""));
  return EXIT_OK;
}

function patchFiles(cp) {
  return cp.modified_files.filter((f) => !isUnder(f, cp.pre_existing_changes));
}

function cmdSnapshot(root, flags) {
  const cp = findCheckpoint(root, flags);
  if (!cp.git) {
    emit(flags, { result: "skipped", reason: "not a git repository", checkpoint: cp },
      "Not a git repository: snapshot is a no-op. Backups made with checkpoint.js backup are the rollback source.");
    return EXIT_OK;
  }
  const git = detectGit(root);
  if (!git) throw new CliError("The checkpoint was started in a git repository, but git is not available now");
  const files = patchFiles(cp);
  let patch = Buffer.alloc(0);
  if (files.length) {
    const res = runGit(root, ["diff", "--binary", "--no-color", "--no-ext-diff", git.base, "--", ...files], { buffer: true });
    if (res.status !== 0) throw new CliError("git diff failed: " + res.stderr.trim());
    patch = res.stdout;
  }
  const patchRel = CHECKPOINT_DIR + "/" + cp.id + ".patch";
  fs.writeFileSync(path.join(root, ...patchRel.split("/")), patch);
  cp.patch = patchRel;
  const excluded = cp.modified_files.filter((f) => !files.includes(f));
  saveCheckpoint(root, cp);
  const lines = ["Snapshot written: " + patchRel + " (" + patch.length + " bytes, " + files.length + " file(s))"];
  if (excluded.length) lines.push("  excluded (pre-existing changes, restored from backups only): " + excluded.join(", "));
  if (cp.created_files.length) lines.push("  created files are tracked by name, not in the patch: " + cp.created_files.join(", "));
  emit(flags, { result: "snapshot", patch: patchRel, bytes: patch.length, files, excluded, checkpoint: cp }, lines.join("\n"));
  return EXIT_OK;
}

function cmdStatus(root, flags) {
  const skill = optionalSlug(flags, "skill");
  const feature = optionalSlug(flags, "feature");
  let list = loadAll(root);
  if (!flags.all) list = list.filter((c) => c.status === "open");
  if (skill) list = list.filter((c) => c.skill === skill);
  if (feature) list = list.filter((c) => c.feature === feature);
  if (flags.id) list = list.filter((c) => c.id === flags.id);
  emit(flags, list, list.length ? list.map(summarize).join("\n\n") : (flags.all ? "No checkpoints." : "No open checkpoints."));
  return EXIT_OK;
}

function isTracked(root, file) {
  return runGit(root, ["ls-files", "--error-unmatch", "--", file]).status === 0;
}

// Checkpoint files live in the project and can be edited by hand or arrive with a
// clone. Re-check every stored path before rollback writes or deletes anything.
function validateStored(root, cp) {
  const bad = (what) => {
    throw new CliError("Refusing rollback: checkpoint " + cp.id + " has an invalid " + what + "; nothing was changed");
  };
  const listOk = (list) => list === undefined || Array.isArray(list);
  if (!listOk(cp.created_files) || !listOk(cp.modified_files) || !listOk(cp.backups) || !listOk(cp.pre_existing_changes)) bad("file list");
  const inside = (p, what) => {
    try {
      if (relInside(root, p) !== p) bad(what + " path " + JSON.stringify(p));
    } catch (err) {
      if (err instanceof CliError && /^Refusing rollback/.test(err.message)) throw err;
      bad(what + " path " + JSON.stringify(p));
    }
  };
  for (const f of cp.created_files || []) {
    inside(f, "created file");
    if (isUnder(CHECKPOINT_DIR, [f])) bad("created path " + JSON.stringify(f) + " (it contains the checkpoint store)");
  }
  for (const f of cp.modified_files || []) inside(f, "modified file");
  const backupPrefix = CHECKPOINT_DIR + "/" + cp.id + ".backups/";
  for (const b of cp.backups || []) {
    if (!b || typeof b.file !== "string" || typeof b.copy !== "string") bad("backup entry");
    inside(b.file, "backup target");
    inside(b.copy, "backup copy");
    if (b.copy !== backupPrefix + b.file) bad("backup copy path " + JSON.stringify(b.copy));
  }
  if (cp.patch !== null && cp.patch !== undefined && cp.patch !== CHECKPOINT_DIR + "/" + cp.id + ".patch") bad("patch path");
}

// True when a created path holds, or is inside, something that existed before the run.
function touchesPreExisting(cp, file) {
  const pre = cp.pre_existing_changes || [];
  return isUnder(file, pre) || pre.some((p) => isUnder(p, [file]));
}

// Oldest modification time of any file under dir (or the entry itself), skipping symlinks.
function oldestMtime(abs) {
  const st = fs.lstatSync(abs);
  if (!st.isDirectory()) return st.mtimeMs;
  let oldest = Infinity;
  for (const name of fs.readdirSync(abs)) oldest = Math.min(oldest, oldestMtime(path.join(abs, name)));
  return oldest;
}

function cmdRollback(root, flags) {
  const cp = findCheckpoint(root, flags, { allowClosed: true });
  validateStored(root, cp);
  const dry = Boolean(flags["dry-run"]);
  const report = {
    result: dry ? "dry-run" : "rolled-back",
    checkpoint_id: cp.id,
    patch: { path: cp.patch, applied: false, files: [] },
    backups: { restored: [], pending: [] },
    created: { deleted: [], kept: [], skipped_tracked: [], skipped_preexisting: [] },
    notes: [],
  };
  const lines = [(dry ? "Dry run: rollback of " : "Rollback of ") + cp.id + " [" + cp.status + "]"];

  // 1. Reverse the patch (git only).
  if (cp.git) {
    const git = detectGit(root);
    if (!git) throw new CliError("The checkpoint was made in a git repository, but git is not available now");
    if (!cp.patch) {
      if (patchFiles(cp).length) {
        throw new CliError("No snapshot patch recorded for " + cp.id + ". Run snapshot first; rollback never discards changes it has no patch for.");
      }
      lines.push("  patch: none (no tracked files modified)");
    } else {
      const patchAbs = path.join(root, ...cp.patch.split("/"));
      if (!fs.existsSync(patchAbs)) throw new CliError("Patch file is missing: " + cp.patch);
      const size = fs.statSync(patchAbs).size;
      if (size === 0) {
        lines.push("  patch: empty, nothing to reverse");
      } else {
        const stat = runGit(git.toplevel, ["apply", "-R", "--numstat", patchAbs]);
        report.patch.files = String(stat.stdout).split("\n").filter(Boolean).map((l) => l.split("\t").slice(2).join("\t"));
        const check = runGit(git.toplevel, ["apply", "-R", "--check", patchAbs]);
        // A patch that applies forward cleanly has already been reversed (e.g. an earlier
        // rollback without --restore-backups/--delete-created). Skip it and continue.
        const alreadyReversed = check.status !== 0 && runGit(git.toplevel, ["apply", "--check", patchAbs]).status === 0;
        if (alreadyReversed) {
          report.patch.already_reversed = true;
          lines.push("  patch already reversed (earlier rollback); skipping: " + report.patch.files.join(", "));
        } else if (check.status !== 0) {
          report.result = "conflict";
          report.conflicts = check.stderr.trim();
          emit(flags, report,
            lines.concat([
              "  The patch no longer reverses cleanly. These files changed after the snapshot (possibly by the user):",
              check.stderr.trim().split("\n").map((l) => "    " + l).join("\n"),
              "  Nothing was changed. Show the conflicts to the user and resolve them by hand.",
            ]).join("\n"));
          return EXIT_ERROR;
        } else if (dry) {
          lines.push("  patch reverses cleanly; would revert: " + report.patch.files.join(", "));
        } else {
          const apply = runGit(git.toplevel, ["apply", "-R", patchAbs]);
          if (apply.status !== 0) throw new CliError("git apply -R failed: " + apply.stderr.trim());
          report.patch.applied = true;
          lines.push("  reverted: " + report.patch.files.join(", "));
        }
      }
    }
  } else {
    lines.push("  not a git repository: only backups can be restored");
  }

  // 2. Backups.
  for (const b of cp.backups) {
    const copyAbs = path.join(root, ...b.copy.split("/"));
    if (!fs.existsSync(copyAbs)) {
      report.notes.push("backup copy missing for " + b.file);
      continue;
    }
    if (flags["restore-backups"]) {
      if (!dry) {
        const target = path.join(root, ...b.file.split("/"));
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.copyFileSync(copyAbs, target);
      }
      report.backups.restored.push(b.file);
    } else {
      report.backups.pending.push(b.file);
    }
  }
  if (report.backups.restored.length) lines.push("  " + (dry ? "would restore" : "restored") + " backups: " + report.backups.restored.join(", "));
  if (report.backups.pending.length) lines.push("  backups not restored (ask the user, then pass --restore-backups): " + report.backups.pending.join(", "));

  // 3. Created files.
  for (const f of cp.created_files) {
    const abs = path.join(root, ...f.split("/"));
    let lst;
    try {
      lst = fs.lstatSync(abs);
    } catch (err) {
      continue; // already gone
    }
    if (cp.git && isTracked(root, f)) {
      report.created.skipped_tracked.push(f);
      continue;
    }
    // A "created" path that holds the user's earlier changes, or a directory with
    // files older than the run, was not wholly created by the run: never delete it.
    const started = Date.parse(cp.started_at);
    if (touchesPreExisting(cp, f) || (lst.isDirectory() && Number.isFinite(started) && oldestMtime(abs) < started - 2000)) {
      report.created.skipped_preexisting.push(f);
      continue;
    }
    if (flags["delete-created"]) {
      if (!dry) {
        if (lst.isDirectory()) fs.rmSync(abs, { recursive: true, force: true });
        else fs.unlinkSync(abs); // files and symlinks (never follows the link)
      }
      report.created.deleted.push(f);
    } else {
      report.created.kept.push(f);
    }
  }
  if (report.created.deleted.length) lines.push("  " + (dry ? "would delete" : "deleted") + " created files: " + report.created.deleted.join(", "));
  if (report.created.kept.length) lines.push("  created files kept (ask the user, then pass --delete-created): " + report.created.kept.join(", "));
  if (report.created.skipped_tracked.length) lines.push("  created files now tracked by git, left alone: " + report.created.skipped_tracked.join(", "));
  if (report.created.skipped_preexisting.length) lines.push("  created paths that hold files from before the run, left alone: " + report.created.skipped_preexisting.join(", "));
  report.notes.forEach((n) => lines.push("  note: " + n));

  if (!dry) {
    cp.status = "abandoned";
    cp.rolled_back_at = nowIso();
    saveCheckpoint(root, cp);
    lines.push("  checkpoint marked abandoned");
  }
  emit(flags, report, lines.join("\n"));
  return EXIT_OK;
}

function cmdClose(root, flags) {
  const status = flags.status === undefined ? "completed" : flags.status;
  if (status !== "completed" && status !== "abandoned") throw new CliError("--status must be completed or abandoned", EXIT_USAGE);
  const cp = findCheckpoint(root, flags);
  cp.status = status;
  saveCheckpoint(root, cp);
  const pending = cp.pending_steps.length ? " (pending steps left: " + cp.pending_steps.join(", ") + ")" : "";
  emit(flags, { result: "closed", checkpoint: cp }, "Closed " + cp.id + " as " + status + pending);
  return EXIT_OK;
}

// ---------------------------------------------------------------------------

function main(argv) {
  let parsed;
  try {
    parsed = parseArgs(argv);
  } catch (err) {
    process.stderr.write(err.message + "\n\n" + USAGE + "\n");
    return err.exitCode || EXIT_USAGE;
  }
  const { command, flags, positionals } = parsed;
  if (flags.help || command === "help") {
    process.stdout.write(USAGE + "\n");
    return EXIT_OK;
  }
  if (!command) {
    process.stderr.write(USAGE + "\n");
    return EXIT_USAGE;
  }
  if (flags.status !== undefined && command === "close" && !STATUSES.includes(flags.status)) {
    process.stderr.write("--status must be completed or abandoned\n");
    return EXIT_USAGE;
  }
  const root = process.cwd();
  const handlers = {
    start: cmdStart,
    backup: cmdBackup,
    record: cmdRecord,
    snapshot: cmdSnapshot,
    status: cmdStatus,
    rollback: cmdRollback,
    close: cmdClose,
  };
  const handler = handlers[command];
  if (!handler) {
    process.stderr.write("Unknown command: " + command + "\n\n" + USAGE + "\n");
    return EXIT_USAGE;
  }
  if (command !== "backup" && positionals.length) {
    process.stderr.write("Unexpected argument(s): " + positionals.join(" ") + "\n\n" + USAGE + "\n");
    return EXIT_USAGE;
  }
  try {
    return handler(root, flags, positionals);
  } catch (err) {
    if (err instanceof CliError) {
      if (flags.json) process.stdout.write(JSON.stringify({ result: "error", error: err.message }) + "\n");
      process.stderr.write("Error: " + err.message + "\n");
      if (err.exitCode === EXIT_USAGE) process.stderr.write("\n" + USAGE + "\n");
      return err.exitCode;
    }
    process.stderr.write("Error: " + (err && err.stack ? err.stack : String(err)) + "\n");
    return EXIT_ERROR;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, parseArgs, compactTimestamp, SLUG_RE };
