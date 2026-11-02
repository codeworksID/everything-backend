#!/usr/bin/env node
"use strict";

// everything-backend command guard.
// Classifies a shell command as "allow" (guard has no objection; the host's
// normal permissions still apply) or "ask" (confirm with the user first).
// Node >= 18, no dependencies. Used by hooks/guard-hook.js and usable as a CLI:
//
//   node guard.js [--strict] [--shell bash|powershell] -- "<command>"
//
// Prints {decision, category, reason} as JSON. Exit 0 for allow, 10 for ask,
// 2 for usage errors.

const os = require("node:os");

const CATEGORIES = [
  { id: "git-history", mode: "default", description: "Git commands that discard work or rewrite history (reset --hard, clean -f, checkout -- path, restore, push --force, branch -D, stash drop/clear)." },
  { id: "migration", mode: "default", description: "Commands that apply, revert or reset database migrations or push a schema to a database." },
  { id: "destructive-sql", mode: "default", description: "SQL clients running DROP, TRUNCATE, ALTER, or DELETE/UPDATE without WHERE, or SQL from a file." },
  { id: "deploy-infra", mode: "default", description: "Deploys, releases and infrastructure changes (kubectl, helm, terraform, pulumi, docker push, cloud CLIs, publish)." },
  { id: "recursive-delete", mode: "default", description: "Recursive deletes outside obvious build, cache and temp directories." },
  { id: "git-write", mode: "strict", description: "Any git ref write: commit, push, merge, rebase, switch/checkout, stash, reset, tag, branch changes." },
  { id: "dependency-change", mode: "strict", description: "Installing, upgrading or removing dependencies or packages." },
  { id: "remote-script", mode: "strict", description: "Piping a downloaded script into a shell or interpreter (curl | sh)." },
];

const ALLOW = Object.freeze({ decision: "allow", category: "none", reason: "no guarded pattern matched" });

function ask(category, reason) {
  return { decision: "ask", category, reason };
}

// ---------------------------------------------------------------------------
// Tokenizer

const MAX_DEPTH = 3;

function isSpace(c) {
  return c === " " || c === "\t" || c === "\r";
}

// Reads a balanced $( ... ) / ( ... ) body starting after the opening paren.
function readBalanced(s, i, open, close) {
  let depth = 1;
  let quote = null;
  let start = i;
  while (i < s.length) {
    const c = s[i];
    if (quote) {
      if (c === quote) quote = null;
      else if (c === "\\" && quote === '"') i += 1;
    } else if (c === "'" || c === '"') {
      quote = c;
    } else if (c === open) {
      depth += 1;
    } else if (c === close) {
      depth -= 1;
      if (depth === 0) return { body: s.slice(start, i), end: i + 1 };
    }
    i += 1;
  }
  return { body: s.slice(start), end: s.length };
}

// Splits a command line into segments separated by && || ; | & and newlines.
// Each segment: { words: [{value, quoted}], sep (operator before it), redirs, heredoc, herestring, raw, subs }.
function tokenize(input, shell) {
  const ps = shell === "powershell";
  // PowerShell escapes with a backtick, cmd.exe with a caret, POSIX shells with a backslash.
  const escape = ps ? "`" : shell === "cmd" ? "^" : "\\";
  const s = String(input);
  const segments = [];
  const subs = []; // command substitutions found anywhere
  let i = 0;
  let word = null; // { value, quoted }
  const pendingHeredocs = [];
  let seg = newSegment(null);

  function newSegment(sep) {
    return { words: [], sep, redirs: [], heredoc: null, herestring: null, rawStart: i, raw: "" };
  }
  function pushWord() {
    if (word !== null) {
      const last = seg.redirs.length ? seg.redirs[seg.redirs.length - 1] : null;
      if (last && last.target === undefined) last.target = word.value;
      else if (seg.expectHeredocDelim) {
        pendingHeredocs.push({ seg, delim: word.value.replace(/^-/, "") });
        seg.expectHeredocDelim = false;
      } else if (seg.expectHerestring) {
        seg.herestring = word.value;
        seg.expectHerestring = false;
      } else seg.words.push(word);
    }
    word = null;
  }
  function endSegment(sep, at) {
    pushWord();
    seg.raw = s.slice(seg.rawStart, at).trim();
    if (seg.words.length || seg.redirs.length || seg.heredoc || seg.herestring !== null) segments.push(seg);
    seg = newSegment(sep);
    seg.rawStart = i;
  }
  function addChar(c, quoted) {
    if (word === null) word = { value: "", quoted: false };
    word.value += c;
    if (quoted) word.quoted = true;
  }
  function consumeHeredocs() {
    // Called right after a newline: read heredoc bodies in order.
    while (pendingHeredocs.length) {
      const h = pendingHeredocs.shift();
      const lines = [];
      while (i < s.length) {
        let nl = s.indexOf("\n", i);
        if (nl === -1) nl = s.length;
        const line = s.slice(i, nl).replace(/\r$/, "");
        i = nl + 1;
        if (line.trim() === h.delim) break;
        lines.push(line);
      }
      h.seg.heredoc = lines.join("\n");
    }
  }

  while (i < s.length) {
    const c = s[i];
    const next = s[i + 1];

    if (c === "\n") {
        endSegment("\n", i);
      i += 1;
      if (pendingHeredocs.length) {
        consumeHeredocs();
        seg.rawStart = i;
      }
      continue;
    }
    if (isSpace(c)) {
      pushWord();
      i += 1;
      continue;
    }
    if (c === "#" && word === null) {
      // comment to end of line
      while (i < s.length && s[i] !== "\n") i += 1;
      continue;
    }
    if (c === escape) {
      if (next === "\n") {
        i += 2;
        continue;
      }
      if (next !== undefined) addChar(next, true);
      i += 2;
      continue;
    }
    if (c === "'") {
      const end = s.indexOf("'", i + 1);
      const stop = end === -1 ? s.length : end;
      addChar("", true);
      word.value += s.slice(i + 1, stop);
      i = stop + 1;
      continue;
    }
    if (c === '"') {
      addChar("", true);
      i += 1;
      while (i < s.length && s[i] !== '"') {
        if (s[i] === escape && i + 1 < s.length) {
          word.value += s[i + 1];
          i += 2;
          continue;
        }
        if (s[i] === "$" && s[i + 1] === "(") {
          const r = readBalanced(s, i + 2, "(", ")");
          subs.push(r.body);
          word.value += s.slice(i, r.end);
          i = r.end;
          continue;
        }
        if (!ps && s[i] === "`") {
          const end = s.indexOf("`", i + 1);
          const stop = end === -1 ? s.length : end;
          subs.push(s.slice(i + 1, stop));
          word.value += s.slice(i, stop + 1);
          i = stop + 1;
          continue;
        }
        word.value += s[i];
        i += 1;
      }
      i += 1;
      continue;
    }
    if (c === "$" && next === "(") {
      const r = readBalanced(s, i + 2, "(", ")");
      subs.push(r.body);
      addChar(s.slice(i, r.end), false);
      i = r.end;
      continue;
    }
    if (!ps && c === "`") {
      const end = s.indexOf("`", i + 1);
      const stop = end === -1 ? s.length : end;
      subs.push(s.slice(i + 1, stop));
      addChar(s.slice(i, stop + 1), false);
      i = stop + 1;
      continue;
    }
    if (c === "<" && next === "(" && !ps) {
      // process substitution <( ... )
      const r = readBalanced(s, i + 2, "(", ")");
      subs.push(r.body);
      addChar(s.slice(i, r.end), false);
      i = r.end;
      continue;
    }
    if (c === "&" && next === "&") {
      endSegment("&&", i);
      i += 2;
      seg.rawStart = i;
      continue;
    }
    if (c === "|" && next === "|") {
      endSegment("||", i);
      i += 2;
      seg.rawStart = i;
      continue;
    }
    if (c === "|") {
      endSegment("|", i);
      i += next === "&" ? 2 : 1;
      seg.rawStart = i;
      continue;
    }
    if (c === ";") {
      endSegment(";", i);
      i += 1;
      seg.rawStart = i;
      continue;
    }
    // PowerShell: "(expr)" in argument position is one argument, e.g.
    // "Remove-Item (Join-Path $root 'src') -Recurse". Keep the flags after it in
    // the same command and still classify the inner expression.
    if (ps && c === "(" && word === null && seg.words.length &&
      !/^(if|elseif|while|until|for|foreach|switch|catch|param|function|filter|trap|where|%|\?|foreach-object|where-object)$/i.test(seg.words[seg.words.length - 1].value)) {
      const r = readBalanced(s, i + 1, "(", ")");
      subs.push(r.body);
      addChar(s.slice(i, r.end), false);
      i = r.end;
      continue;
    }
    // An unquoted ")" always closes a subshell or group, even right after a word:
    // "(git reset --hard)" must not leave "--hard)" as the flag.
    if (c === ")" || (c === "(" && word === null)) {
      endSegment(";", i);
      i += 1;
      seg.rawStart = i;
      continue;
    }
    if (c === "&") {
      if (next === ">") {
        // &> or &>> redirect
        pushWord();
        let op = "&>";
        i += 2;
        if (s[i] === ">") {
          op += ">";
          i += 1;
        }
        seg.redirs.push({ op });
        continue;
      }
      if (ps) {
        // PowerShell call operator
        addChar("&", false);
        pushWord();
        i += 1;
        continue;
      }
      endSegment("&", i);
      i += 1;
      seg.rawStart = i;
      continue;
    }
    if (c === ">" || c === "<") {
      // redirection; a word made only of digits before it is the fd number
      if (word !== null && /^\d+$/.test(word.value) && !word.quoted) word = null;
      else pushWord();
      let op = c;
      i += 1;
      while (s[i] === c) {
        op += c;
        i += 1;
      }
      if (s[i] === "&") {
        // 2>&1 style: consume the fd
        op += "&";
        i += 1;
        let fd = "";
        while (i < s.length && /[0-9-]/.test(s[i])) fd += s[i++];
        seg.redirs.push({ op, target: fd });
        continue;
      }
      if (op === "<<") {
        if (s[i] === "-") i += 1;
        seg.expectHeredocDelim = true;
        continue;
      }
      if (op === "<<<") {
        seg.expectHerestring = true;
        continue;
      }
      seg.redirs.push({ op });
      continue;
    }
    addChar(c, false);
    i += 1;
  }
  endSegment(null, s.length);
  for (const sg of segments) {
    delete sg.expectHeredocDelim;
    delete sg.expectHerestring;
    delete sg.rawStart;
  }
  return { segments, subs };
}

// ---------------------------------------------------------------------------
// Command normalization

function baseName(cmd) {
  let b = String(cmd).replace(/\\/g, "/");
  b = b.slice(b.lastIndexOf("/") + 1);
  b = b.toLowerCase().replace(/\.(exe|cmd|bat|ps1|sh)$/, "");
  // strip an npm version suffix: prisma@5 -> prisma (but keep @scope/name)
  if (b.lastIndexOf("@") > 0) b = b.slice(0, b.lastIndexOf("@"));
  return b;
}

const ENV_ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/;
const SHELL_KEYWORDS = new Set(["if", "then", "do", "else", "elif", "while", "until", "!", "{", "}", "time", "nohup", "exec", "builtin", "busybox", "&", "."]);
// Wrappers that run the rest of the line as a command, with flags whose values are separate words.
const WRAPPER_VALUE_FLAGS = {
  nice: new Set(["-n", "--adjustment"]),
  ionice: new Set(["-c", "--class", "-n", "--classdata"]),
  stdbuf: new Set(["-i", "-o", "-e", "--input", "--output", "--error"]),
  chronic: new Set(),
  caffeinate: new Set(["-t", "-w"]),
};
const SUDO_ARG_FLAGS = new Set(["-u", "-g", "-C", "-D", "-h", "-p", "-r", "-t", "-U", "--user", "--group"]);
const UV_ARG_FLAGS = new Set(["--with", "--env-file", "--project", "--directory", "-p", "--python", "--package", "--extra", "--group", "--from", "--index", "--index-url"]);

// Strips wrappers (env vars, sudo, npx, pnpm exec, uv run, python -m, ...).
// Returns { cmd, args, words, script? } where script is set for package-script runners.
function unwrap(words) {
  let w = words.slice();
  let guard = 0;
  while (w.length && guard++ < 20) {
    const first = w[0];
    const name = baseName(first);
    if (ENV_ASSIGN.test(first) && !first.startsWith("=")) {
      w = w.slice(1);
      continue;
    }
    if (SHELL_KEYWORDS.has(first) || SHELL_KEYWORDS.has(name)) {
      w = w.slice(1);
      continue;
    }
    if (name === "command") {
      // "command -v rm" only looks a name up; "command -p rm -rf x" runs it.
      w = w.slice(1);
      while (w.length && /^-[pvV]+$/.test(w[0])) {
        if (/[vV]/.test(w[0])) return { cmd: "", args: [], words: [] };
        w = w.slice(1);
      }
      continue;
    }
    if (Object.prototype.hasOwnProperty.call(WRAPPER_VALUE_FLAGS, name)) {
      const valued = WRAPPER_VALUE_FLAGS[name];
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) {
        const f = w[0];
        w = w.slice(valued.has(f) ? 2 : 1);
        if (f === "--") break;
      }
      continue;
    }
    if (name === "env") {
      w = w.slice(1);
      while (w.length && (w[0].startsWith("-") || ENV_ASSIGN.test(w[0]))) w = w.slice(1);
      continue;
    }
    if (name === "sudo" || name === "doas") {
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) {
        const flag = w[0];
        w = w.slice(SUDO_ARG_FLAGS.has(flag) ? 2 : 1);
      }
      continue;
    }
    if (name === "timeout") {
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) w = w.slice(1);
      w = w.slice(1); // duration
      continue;
    }
    if (name === "xargs") {
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) {
        const f = w[0];
        w = w.slice(/^-[IdLnPs]$/.test(f) ? 2 : 1);
      }
      if (!w.length) return { cmd: "", args: [], words: [] };
      return Object.assign(unwrap(w), { viaXargs: true });
    }
    if (name === "npx" || name === "bunx" || name === "pnpx") {
      w = w.slice(1);
      while (w.length && w[0].startsWith("-")) {
        const f = w[0];
        w = w.slice(f === "-p" || f === "--package" ? 2 : 1);
        if (f === "--") break;
      }
      continue;
    }
    if ((name === "npm" || name === "pnpm" || name === "yarn" || name === "bun") && w.length > 1) {
      const sub = w[1].toLowerCase();
      if (sub === "exec" || sub === "dlx" || sub === "x") {
        w = w.slice(2);
        while (w.length && w[0].startsWith("-")) {
          const f = w[0];
          w = w.slice(1);
          if (f === "--") break;
        }
        continue;
      }
      if (sub === "run" || sub === "run-script") {
        let rest = w.slice(2);
        while (rest.length && rest[0].startsWith("-")) rest = rest.slice(1);
        return { cmd: name, args: w.slice(1), words: w, script: rest[0] || "" };
      }
      if (name !== "npm" && !PM_BUILTINS.has(sub) && !sub.startsWith("-")) {
        // pnpm prisma ..., yarn prisma ... run a local binary or a package script
        const unwrapped = unwrap(w.slice(1));
        unwrapped.scriptCandidate = w[1];
        return unwrapped;
      }
      break;
    }
    if (name === "bundle" && w[1] === "exec") {
      w = w.slice(2);
      continue;
    }
    if ((name === "uv" || name === "poetry" || name === "pipenv" || name === "pdm" || name === "hatch" || name === "rye") && w[1] === "run") {
      w = w.slice(2);
      while (w.length && w[0].startsWith("-")) {
        const f = w[0];
        w = w.slice(UV_ARG_FLAGS.has(f) ? 2 : 1);
        if (f === "--") break;
      }
      continue;
    }
    if (/^(python|python3|python3\.\d+|py|pypy3?)$/.test(name)) {
      let i = 1;
      while (i < w.length && w[i].startsWith("-") && w[i] !== "-m" && w[i] !== "-c") i += 1;
      if (w[i] === "-m" && w[i + 1]) {
        w = w.slice(i + 1);
        continue;
      }
      if (w[i] && !w[i].startsWith("-")) {
        // python manage.py migrate -> manage.py migrate
        w = w.slice(i);
        continue;
      }
      break;
    }
    if (name === "php" && w[1] && baseName(w[1]) === "artisan") {
      w = w.slice(1);
      continue;
    }
    break;
  }
  if (!w.length) return { cmd: "", args: [], words: [] };
  return { cmd: baseName(w[0]), args: w.slice(1), words: w };
}

const PM_BUILTINS = new Set([
  "install", "i", "add", "remove", "rm", "uninstall", "un", "update", "up", "upgrade", "ci", "link", "unlink",
  "publish", "pack", "init", "create", "test", "t", "start", "stop", "build", "info", "why", "list", "ls", "outdated",
  "audit", "config", "set", "get", "cache", "store", "import", "dedupe", "prune", "rebuild", "patch", "help", "version",
  "login", "logout", "whoami", "workspace", "workspaces", "dlx", "exec", "x", "run", "node", "env", "setup", "global",
  "licenses", "recursive", "-r", "--filter",
]);

// ---------------------------------------------------------------------------
// Helpers

function nonFlags(args) {
  return args.filter((a) => !a.startsWith("-"));
}

function hasFlag(args, ...names) {
  return args.some((a) => names.some((n) => a === n || a.startsWith(n + "=")));
}

// Short combined flags like -fdx contain the letter.
function hasShort(args, letter) {
  return args.some((a) => /^-[A-Za-z]+$/.test(a) && a.slice(1).includes(letter));
}

function lowerArgs(args) {
  return args.map((a) => a.toLowerCase());
}

// ---------------------------------------------------------------------------
// Git

function gitSplit(args) {
  let i = 0;
  while (i < args.length && args[i].startsWith("-")) {
    const a = args[i];
    if (a === "-C" || a === "-c" || a === "--git-dir" || a === "--work-tree" || a === "--namespace") i += 2;
    else i += 1;
  }
  return { sub: (args[i] || "").toLowerCase(), rest: args.slice(i + 1) };
}

const PATHISH = /(^\.{1,2}$)|(^\.{1,2}[\\/])|([\\/]$)|(\.[A-Za-z][A-Za-z0-9]{0,7}$)|[*?]/;

function classifyGit(args, mode) {
  const { sub, rest } = gitSplit(args);
  const strict = mode === "strict";
  const nf = nonFlags(rest);
  const H = (reason) => ask("git-history", reason);
  const W = (reason) => ask("git-write", reason);

  switch (sub) {
    case "reset":
      if (hasFlag(rest, "--hard")) return H("git reset --hard discards uncommitted work");
      if (hasFlag(rest, "--merge", "--keep") && strict) return W("git reset moves HEAD");
      if (strict && nf.length && rest[0] !== "--" && !rest.includes("--")) return W("git reset can move HEAD (ref write)");
      return null;
    case "clean":
      if (hasFlag(rest, "-n", "--dry-run") || hasShort(rest, "n")) return null;
      if (hasFlag(rest, "--force") || hasShort(rest, "f")) return H("git clean -f deletes untracked files");
      return null;
    case "checkout": {
      const dd = rest.indexOf("--");
      if (dd !== -1) return H("git checkout -- <path> discards local changes to those files");
      if (hasFlag(rest, "-f", "--force") || hasShort(rest, "f") && !hasShort(rest, "b")) return H("git checkout --force discards local changes");
      if (hasFlag(rest, "-p", "--patch")) return H("git checkout -p discards selected local changes");
      if (rest.includes("-B")) return H("git checkout -B resets an existing branch and can drop its commits");
      const creates = hasFlag(rest, "-b", "--orphan");
      if (!creates) {
        if (nf.includes(".")) return H("git checkout . discards all local changes");
        if (nf.length >= 2) return H("git checkout <ref> <path> overwrites local files");
        if (nf.length === 1 && PATHISH.test(nf[0])) return H("git checkout <path> discards local changes to that path");
      }
      if (strict) return W("git checkout switches or creates a branch (ref write)");
      return null;
    }
    case "restore": {
      const staged = hasFlag(rest, "--staged") || hasShort(rest, "S");
      const worktree = hasFlag(rest, "--worktree") || hasShort(rest, "W");
      if (staged && !worktree) return null;
      return H("git restore overwrites working-tree files");
    }
    case "switch":
      if (hasFlag(rest, "--discard-changes", "--force", "-f")) return H("git switch --discard-changes discards local changes");
      if (rest.includes("-C") || hasFlag(rest, "--force-create")) return H("git switch -C resets an existing branch and can drop its commits");
      if (strict) return W("git switch changes the checked-out branch");
      return null;
    case "push": {
      if (hasFlag(rest, "--force", "-f", "--force-with-lease", "--force-if-includes", "--mirror") || hasShort(rest, "f")) {
        return H("git push --force can overwrite remote history");
      }
      if (hasFlag(rest, "--delete", "-d") || hasShort(rest, "d")) return H("git push --delete removes a remote ref");
      if (nonFlags(rest).some((r) => r.startsWith("+") || r.startsWith(":"))) return H("git push with a +refspec force-updates or deletes a remote ref");
      if (strict) return W("git push writes to the remote");
      return null;
    }
    case "branch": {
      if (hasFlag(rest, "-D") || (hasFlag(rest, "--delete", "-d") && hasFlag(rest, "--force", "-f")) || /^-[a-z]*D/.test(rest.find((a) => /^-[A-Za-z]+$/.test(a)) || "")) {
        return H("git branch -D deletes a branch even if unmerged");
      }
      if (hasFlag(rest, "-M") || (hasFlag(rest, "-m", "--move") && hasFlag(rest, "--force", "-f"))) return H("git branch -M overwrites an existing branch");
      if (strict) {
        const listing = hasFlag(rest, "--list", "-l", "-a", "--all", "-r", "--remotes", "-v", "-vv", "--verbose", "--show-current", "--contains", "--merged", "--no-merged", "--format", "--sort", "--points-at");
        if (!listing && (nf.length || hasFlag(rest, "-d", "--delete", "-m", "--move", "-c", "--copy", "-u", "--set-upstream-to", "--unset-upstream"))) {
          return W("git branch creates, renames or deletes a branch");
        }
      }
      return null;
    }
    case "stash": {
      const action = (nf[0] || "push").toLowerCase();
      if (action === "drop" || action === "clear") return H("git stash " + action + " permanently discards stashed work");
      if (strict && action !== "list" && action !== "show") return W("git stash " + action + " changes the stash or working tree");
      return null;
    }
    case "rm":
      // git rm refuses to drop files with local changes unless forced; --cached keeps the working tree.
      if ((hasFlag(rest, "--force") || hasShort(rest, "f")) && !hasFlag(rest, "--cached")) {
        return H("git rm -f deletes files even when they have uncommitted changes");
      }
      return null;
    case "reflog":
      if ((nf[0] || "").toLowerCase() === "expire" || (nf[0] || "").toLowerCase() === "delete") return H("git reflog " + nf[0] + " removes recovery points");
      return null;
    case "filter-branch":
    case "filter-repo":
      return H("git " + sub + " rewrites history");
    case "update-ref":
      if (hasFlag(rest, "-d")) return H("git update-ref -d deletes a ref");
      return strict ? W("git update-ref writes a ref") : null;
    case "gc":
      if (rest.some((a) => /^--prune=now$/.test(a))) return H("git gc --prune=now removes unreachable objects");
      return null;
    case "commit":
    case "merge":
    case "rebase":
    case "cherry-pick":
    case "revert":
    case "am":
    case "pull":
      return strict ? W("git " + sub + " writes commits or refs") : null;
    case "tag":
      if (strict && (nf.length || hasFlag(rest, "-d", "--delete", "-f", "--force", "-a", "-s")) && !hasFlag(rest, "-l", "--list")) {
        return W("git tag creates or deletes a tag");
      }
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Migrations

const SAFE_SCRIPT_WORDS = /(status|generate|gen\b|create|new|make|diff|check|list|show|info|plan|lint|validate|dry|print|pending|history|current|heads|version)/;

function migration(reason) {
  return ask("migration", reason);
}

function classifyMigration(cmd, args) {
  const la = lowerArgs(args);
  const nf = nonFlags(la);
  const a0 = nf[0] || "";
  const a1 = nf[1] || "";

  if (cmd === "prisma") {
    if (a0 === "migrate" && ["deploy", "reset", "dev", "resolve"].includes(a1)) {
      return migration("prisma migrate " + a1 + (a1 === "dev" ? " applies migrations to the dev database and can reset it" : " changes the database schema or migration history"));
    }
    if (a0 === "db" && ["push", "execute"].includes(a1)) return migration("prisma db " + a1 + " changes the database directly");
    return null;
  }
  if (cmd === "drizzle-kit") {
    if (["push", "migrate", "drop", "up"].includes(a0) || /^push:/.test(a0) || /^migrate/.test(a0)) return migration("drizzle-kit " + a0 + " changes the database or migration history");
    return null;
  }
  if (cmd === "knex") {
    if (/^migrate:/.test(a0) && !/^migrate:(make|status|list|currentversion)$/.test(a0)) return migration("knex " + a0 + " applies or reverts migrations");
    return null;
  }
  if (cmd === "sequelize" || cmd === "sequelize-cli") {
    if (/^db:migrate/.test(a0) && a0 !== "db:migrate:status") return migration("sequelize " + a0 + " applies or reverts migrations");
    if (a0 === "db:drop") return migration("sequelize db:drop drops the database");
    return null;
  }
  if (/^typeorm/.test(cmd)) {
    if (["migration:run", "migration:revert", "schema:sync", "schema:drop"].includes(a0)) return migration("typeorm " + a0 + " changes the database schema");
    return null;
  }
  if (cmd === "mikro-orm" || cmd === "@mikro-orm/cli") {
    if (["migration:up", "migration:down", "migration:fresh", "schema:drop", "schema:fresh"].includes(a0)) return migration("mikro-orm " + a0 + " changes the database schema");
    if (["schema:update", "schema:create"].includes(a0) && la.includes("--run")) return migration("mikro-orm " + a0 + " --run changes the database schema");
    return null;
  }
  if (cmd === "alembic") {
    if (["upgrade", "downgrade", "stamp"].includes(a0)) return migration("alembic " + a0 + " changes the database schema or revision");
    return null;
  }
  if (cmd === "manage.py" || cmd === "django-admin") {
    if (["migrate", "flush", "reset_db"].includes(a0)) return migration("django " + a0 + " changes the database");
    return null;
  }
  if (cmd === "rails" || cmd === "rake") {
    if (/^db:(migrate|rollback|drop|reset|schema:load|structure:load|setup|purge|truncate_all|seed:replant|prepare|migrate:redo|migrate:up|migrate:down)/.test(a0) && a0 !== "db:migrate:status") {
      return migration(cmd + " " + a0 + " changes the database");
    }
    return null;
  }
  if (cmd === "artisan") {
    if ((/^migrate/.test(a0) && a0 !== "migrate:status") || a0 === "db:wipe") return migration("artisan " + a0 + " changes the database");
    return null;
  }
  if (cmd === "mix") {
    if (/^ecto\.(migrate|rollback|drop|reset|setup)$/.test(a0)) return migration("mix " + a0 + " changes the database");
    return null;
  }
  if (cmd === "flyway") {
    if (la.some((a) => ["migrate", "clean", "repair", "baseline", "undo"].includes(a))) return migration("flyway migrate/clean/repair changes the database");
    return null;
  }
  if (cmd === "liquibase") {
    const op = nf.find((a) => /^(update|rollback|drop-?all|execute-?sql|changelog-?sync)/.test(a));
    if (op && !/-?sql$/.test(op.replace(/^execute-?sql$/, "x"))) return migration("liquibase " + op + " changes the database");
    return null;
  }
  if (cmd === "migrate") {
    // golang-migrate
    if (la.some((a) => ["up", "down", "force", "drop", "goto"].includes(a))) return migration("migrate up/down/force/drop changes the database");
    return null;
  }
  if (cmd === "goose") {
    if (nf.some((a) => /^(up|up-by-one|up-to|down|down-to|redo|reset)$/.test(a))) return migration("goose up/down/reset changes the database");
    return null;
  }
  if (cmd === "atlas") {
    if ((a0 === "migrate" && ["apply", "down"].includes(a1)) || (a0 === "schema" && ["apply", "clean"].includes(a1))) return migration("atlas " + a0 + " " + a1 + " changes the database");
    return null;
  }
  if (cmd === "dotnet") {
    if (a0 === "ef" && a1 === "database" && ["update", "drop"].includes(nf[2] || "")) return migration("dotnet ef database " + nf[2] + " changes the database");
    return null;
  }
  if (cmd === "dotnet-ef") {
    if (a0 === "database" && ["update", "drop"].includes(a1)) return migration("dotnet ef database " + a1 + " changes the database");
    return null;
  }
  if (cmd === "sqlx" || cmd === "cargo-sqlx") {
    const ops = cmd === "cargo-sqlx" ? nf.slice(1) : nf;
    if ((ops[0] === "migrate" && ["run", "revert"].includes(ops[1])) || (ops[0] === "database" && ["drop", "reset", "setup"].includes(ops[1]))) {
      return migration("sqlx " + ops[0] + " " + ops[1] + " changes the database");
    }
    return null;
  }
  if (cmd === "cargo" && a0 === "sqlx") return classifyMigration("sqlx", args.slice(args.findIndex((a) => a.toLowerCase() === "sqlx") + 1));
  if (cmd === "diesel") {
    if ((a0 === "migration" && ["run", "revert", "redo"].includes(a1)) || (a0 === "database" && ["reset", "setup", "drop"].includes(a1))) return migration("diesel " + a0 + " " + a1 + " changes the database");
    return null;
  }
  if (cmd === "dbmate" || cmd === "sql-migrate") {
    if (nf.some((a) => ["up", "down", "migrate", "rollback", "drop"].includes(a))) return migration(cmd + " " + nf[0] + " changes the database");
    return null;
  }
  if (cmd === "supabase") {
    if (a0 === "db" && ["reset", "push"].includes(a1)) return migration("supabase db " + a1 + " changes the database");
    if (a0 === "migration" && ["up", "repair"].includes(a1)) return migration("supabase migration " + a1 + " changes the database");
    return null;
  }
  return null;
}

// Heuristic for package scripts / make targets whose content we cannot see.
function classifyScriptName(runner, name) {
  if (!name) return null;
  const n = name.toLowerCase();
  if (/(^|[:._-])(deploy|destroy|teardown|nuke)([:._-]|$)/.test(n) || /^deploy/.test(n)) {
    return ask("deploy-infra", runner + " " + name + ": the script name suggests a deploy or teardown; its contents were not checked");
  }
  if (/migrat/.test(n) && !SAFE_SCRIPT_WORDS.test(n)) {
    return ask("migration", runner + " " + name + ": the script name suggests applying migrations; its contents were not checked");
  }
  if (/(db|database|schema)[:._-]?(push|reset|drop|wipe|fresh)/.test(n)) {
    return ask("migration", runner + " " + name + ": the script name suggests a schema push or database reset; its contents were not checked");
  }
  return null;
}

// ---------------------------------------------------------------------------
// SQL

function stripSql(text) {
  return String(text)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/\$\$[\s\S]*?\$\$/g, "''");
}

function destructiveSql(text) {
  if (!text) return null;
  const mongo = String(text);
  if (/\.(drop|dropDatabase|dropIndexes|dropIndex)\s*\(/i.test(mongo)) return "drops a collection, index or database";
  if (/\.(deleteMany|remove|updateMany)\s*\(\s*(\{\s*\}\s*)?[,)]/i.test(mongo)) return "deletes or updates every document (empty filter)";
  for (const raw of stripSql(text).split(";")) {
    const st = raw.replace(/\s+/g, " ").trim().toUpperCase();
    if (!st) continue;
    const m = /^(DROP|TRUNCATE|ALTER)\b/.exec(st) || /\b(DROP|TRUNCATE)\s+(TABLE|DATABASE|SCHEMA|INDEX|VIEW|COLUMN|TYPE|SEQUENCE|FUNCTION|TRIGGER|ROLE|USER)\b/.exec(st);
    if (m) return "runs " + m[1];
    const hasWhere = /\bWHERE\b/.test(st);
    if ((/^DELETE\b/.test(st) || /\bDELETE\s+FROM\b/.test(st)) && !hasWhere) return "runs DELETE without WHERE";
    if ((/^UPDATE\s/.test(st) || /[\s(]UPDATE\s+\S+(\s+(AS\s+)?\w+)?\s+SET\b/.test(st)) && /\bSET\b/.test(st) && !hasWhere) return "runs UPDATE without WHERE";
  }
  return null;
}

const SQL_CLIENTS = new Set(["psql", "mysql", "mariadb", "sqlite3", "sqlite", "mongosh", "mongo", "sqlcmd", "cockroach", "clickhouse-client", "duckdb", "invoke-sqlcmd", "redis-cli", "dropdb", "mysqladmin", "pg_restore"]);

function flagValues(args, names, attachedPrefixes) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    const lower = a.toLowerCase();
    for (const n of names) {
      if (lower === n.toLowerCase() && i + 1 < args.length) values.push(args[i + 1]);
      else if (n.startsWith("--") && lower.startsWith(n.toLowerCase() + "=")) values.push(a.slice(n.length + 1));
    }
    for (const p of attachedPrefixes || []) {
      if (a.startsWith(p) && a.length > p.length && !a.startsWith("--")) values.push(a.slice(p.length));
    }
  }
  return values;
}

function classifySqlClient(cmd, args, seg, prevSeg) {
  if (cmd === "redis-cli") {
    if (args.some((a) => /^(flushall|flushdb)$/i.test(a))) return ask("destructive-sql", "redis-cli FLUSHALL/FLUSHDB deletes all keys");
    return null;
  }
  if (cmd === "dropdb") return ask("destructive-sql", "dropdb drops a database");
  if (cmd === "mysqladmin") {
    if (args.some((a) => /^drop$/i.test(a))) return ask("destructive-sql", "mysqladmin drop drops a database");
    return null;
  }
  if (cmd === "pg_restore") {
    if (args.some((a) => /^(-c|--clean)$/.test(a))) return ask("destructive-sql", "pg_restore --clean drops existing objects before restoring");
    return null;
  }
  if (cmd === "cockroach" &&(args[0] || "").toLowerCase() !== "sql") return null;
  let sql = [];
  let files = [];
  switch (cmd) {
    case "psql":
      sql = flagValues(args, ["-c", "--command"], ["-c"]);
      files = flagValues(args, ["-f", "--file"], ["-f"]);
      break;
    case "mysql":
    case "mariadb":
      sql = flagValues(args, ["-e", "--execute"], ["-e"]);
      break;
    case "cockroach":
      sql = flagValues(args, ["-e", "--execute"]);
      files = flagValues(args, ["-f", "--file"]);
      break;
    case "clickhouse-client":
      sql = flagValues(args, ["-q", "--query"]);
      files = flagValues(args, ["--queries-file"]);
      break;
    case "sqlite3":
    case "sqlite":
    case "duckdb": {
      sql = flagValues(args, ["-cmd", "-c"]);
      const valued = new Set(["-cmd", "-c", "-separator", "-nullvalue", "-newline", "-init"]);
      files = flagValues(args, ["-init"]);
      const pos = [];
      for (let i = 0; i < args.length; i += 1) {
        if (args[i].startsWith("-")) {
          if (valued.has(args[i].toLowerCase())) i += 1;
          continue;
        }
        pos.push(args[i]);
      }
      if (pos.length > 1) sql.push(pos.slice(1).join(" "));
      break;
    }
    case "mongosh":
    case "mongo": {
      sql = flagValues(args, ["--eval"]);
      files = flagValues(args, ["-f", "--file"]).concat(nonFlags(args).filter((a) => /\.js$/i.test(a)));
      break;
    }
    case "sqlcmd":
      sql = flagValues(args, ["-Q", "-q"]);
      files = flagValues(args, ["-i"]);
      break;
    case "invoke-sqlcmd":
      sql = flagValues(args, ["-Query"]);
      files = flagValues(args, ["-InputFile"]);
      break;
    default:
      return null;
  }
  for (const r of seg.redirs) if (r.op === "<" && r.target) files.push(r.target);
  if (seg.heredoc !== null && seg.heredoc !== undefined) sql.push(seg.heredoc);
  if (seg.herestring !== null && seg.herestring !== undefined) sql.push(seg.herestring);
  if (seg.sep === "|" && prevSeg) {
    const prev = unwrap(prevSeg.words.map((w) => w.value));
    if (["cat", "type", "get-content", "gc", "zcat", "gunzip"].includes(prev.cmd)) files.push(nonFlags(prev.args)[0] || "(stdin)");
    else sql.push(prevSeg.words.map((w) => w.value).join(" "));
  }
  for (const text of sql) {
    const why = destructiveSql(text);
    if (why) return ask("destructive-sql", cmd + " " + why);
  }
  if (files.length) return ask("destructive-sql", cmd + " runs SQL from " + files.join(", ") + "; its contents were not checked");
  return null;
}

// ---------------------------------------------------------------------------
// Deploy and infrastructure

function deploy(reason) {
  return ask("deploy-infra", reason);
}

function isDryRun(args) {
  return args.some((a) => /^--dry-run(=(client|server|true))?$/i.test(a));
}

// Global flags that take a separate value and may appear before the subcommand
// (e.g. "kubectl -n prod apply", "docker --context prod compose -f x.yml down -v").
const VALUE_FLAGS = {
  kubectl: ["-n", "--namespace", "--context", "--cluster", "--kubeconfig", "-s", "--server", "--user", "--token", "--as", "--as-group", "-f", "--filename", "-l", "--selector", "-o", "--output"],
  helm: ["-n", "--namespace", "--kube-context", "--kubeconfig", "--kube-apiserver", "--kube-token", "--repository-config", "--registry-config", "--repository-cache", "-f", "--values", "--set", "--version"],
  docker: ["-h", "--host", "--context", "-c", "--config", "-l", "--log-level", "-f", "--file", "-p", "--project-name", "--profile", "--env-file", "--project-directory"],
  aws: ["--profile", "--region", "--output", "--endpoint-url", "--query", "--cli-read-timeout", "--cli-connect-timeout", "--ca-bundle", "--color"],
  pulumi: ["-c", "--cwd", "-s", "--stack", "--color", "-v", "--verbose", "--tracing"],
  terraform: ["-chdir"],
  fly: ["-a", "--app", "-c", "--config", "-t", "--access-token"],
};
VALUE_FLAGS.oc = VALUE_FLAGS.kubectl;
VALUE_FLAGS.podman = VALUE_FLAGS.docker;
VALUE_FLAGS["docker-compose"] = VALUE_FLAGS.docker;
VALUE_FLAGS.tofu = VALUE_FLAGS.terraform;
VALUE_FLAGS.flyctl = VALUE_FLAGS.fly;

// Positional words of an argument list, skipping flags and the values of known value-taking flags.
function positionals(args, valueFlags) {
  const out = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--") {
      out.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("-")) {
      if (!a.includes("=") && valueFlags.includes(a)) i += 1;
      continue;
    }
    out.push(a);
  }
  return out;
}

function classifyDeploy(cmd, args) {
  const la = lowerArgs(args);
  const nf = positionals(la, VALUE_FLAGS[cmd] || []);
  const a0 = nf[0] || "";
  const a1 = nf[1] || "";
  switch (cmd) {
    case "kubectl":
    case "oc": {
      const writes = ["apply", "delete", "rollout", "scale", "create", "replace", "patch", "edit", "set", "drain", "cordon", "uncordon", "taint", "autoscale", "label", "annotate", "expose", "run"];
      if (!writes.includes(a0)) return null;
      if (a0 === "rollout" && ["status", "history"].includes(a1)) return null;
      if (isDryRun(la)) return null;
      return deploy(cmd + " " + a0 + " changes cluster state");
    }
    case "helm":
      if (["install", "upgrade", "uninstall", "delete", "del", "un", "rollback"].includes(a0) && !isDryRun(la)) return deploy("helm " + a0 + " changes a release");
      return null;
    case "terraform":
    case "tofu":
    case "terragrunt":
      if (["apply", "destroy", "import", "taint", "untaint", "force-unlock", "run-all"].includes(a0) && !(a0 === "run-all" && ["plan", "validate", "init", "output", "show"].includes(a1))) {
        return deploy(cmd + " " + a0 + " changes infrastructure or state");
      }
      if (a0 === "state" && ["rm", "mv", "push", "replace-provider"].includes(a1)) return deploy(cmd + " state " + a1 + " changes state");
      if (a0 === "workspace" && a1 === "delete") return deploy(cmd + " workspace delete removes a workspace");
      return null;
    case "pulumi":
      if (["up", "update", "destroy", "refresh", "import", "cancel"].includes(a0)) return deploy("pulumi " + a0 + " changes infrastructure or state");
      if (a0 === "stack" && a1 === "rm") return deploy("pulumi stack rm deletes a stack");
      return null;
    case "docker":
    case "podman": {
      if (a0 === "push") return deploy(cmd + " push publishes an image");
      const isCompose = a0 === "compose";
      const sub = isCompose ? a1 : a0;
      if (isCompose && sub === "down" && (la.includes("-v") || la.includes("--volumes"))) return deploy(cmd + " compose down -v deletes volumes and their data");
      if (a0 === "volume" && ["rm", "prune"].includes(a1)) return deploy(cmd + " volume " + a1 + " deletes volume data");
      if (a0 === "system" && a1 === "prune" && la.includes("--volumes")) return deploy(cmd + " system prune --volumes deletes volume data");
      if (isCompose && sub === "push") return deploy(cmd + " compose push publishes images");
      return null;
    }
    case "docker-compose":
      if (a0 === "down" && (la.includes("-v") || la.includes("--volumes"))) return deploy("docker-compose down -v deletes volumes and their data");
      if (a0 === "push") return deploy("docker-compose push publishes images");
      return null;
    case "fly":
    case "flyctl":
      if (["deploy", "destroy"].includes(a0) || (a0 === "apps" && ["destroy", "restart"].includes(a1)) || (a0 === "scale") || (a0 === "releases" && a1 === "rollback")) return deploy(cmd + " " + a0 + " changes a deployed app");
      return null;
    case "vercel":
      if (la.includes("--prod") || la.includes("--production") || ["promote", "rollback", "remove", "rm", "redeploy"].includes(a0)) return deploy("vercel production deploy or release change");
      return null;
    case "netlify":
      if (a0 === "deploy" && la.includes("--prod")) return deploy("netlify deploy --prod publishes to production");
      return null;
    case "gcloud":
      if (nf.some((a) => a === "deploy" || a === "delete" || a === "update-traffic" || a === "rollback")) return deploy("gcloud deploy/delete changes cloud resources");
      return null;
    case "aws": {
      const op = nf[1] || "";
      if (a0 === "s3" && ["rm", "rb", "mv"].includes(op)) return deploy("aws s3 " + op + " deletes or moves objects");
      if (a0 === "s3" && op === "sync" && la.includes("--delete")) return deploy("aws s3 sync --delete deletes objects");
      if (/^(delete|deploy|terminate|remove|update-service|create-deployment|rollback)/.test(op) || op === "deploy") return deploy("aws " + a0 + " " + op + " changes cloud resources");
      return null;
    }
    case "az":
      if (nf.some((a) => a === "delete" || a === "deploy" || a === "purge") || (nf.includes("deployment") && nf.includes("create"))) return deploy("az deploy/delete changes cloud resources");
      return null;
    case "serverless":
    case "sls":
      if (["deploy", "remove", "rollback"].includes(a0)) return deploy(cmd + " " + a0 + " changes a deployed service");
      return null;
    case "cdk":
      if (["deploy", "destroy"].includes(a0)) return deploy("cdk " + a0 + " changes infrastructure");
      return null;
    case "sam":
      if (["deploy", "delete", "sync"].includes(a0)) return deploy("sam " + a0 + " changes a deployed stack");
      return null;
    case "eb":
      if (["deploy", "terminate", "swap", "scale"].includes(a0)) return deploy("eb " + a0 + " changes an environment");
      return null;
    case "wrangler":
      if (["deploy", "publish", "delete", "rollback"].includes(a0) || (a0 === "versions" && a1 === "deploy")) return deploy("wrangler " + a0 + " changes a deployed worker");
      return null;
    case "railway":
      if (["up", "down", "redeploy"].includes(a0)) return deploy("railway " + a0 + " changes a deployment");
      return null;
    case "heroku":
      if (/^(releases:rollback|container:release|pg:reset|pg:push|apps:destroy|ps:scale)/.test(a0)) return deploy("heroku " + a0 + " changes a deployed app");
      return null;
    case "skaffold":
      if (["run", "deploy", "delete"].includes(a0)) return deploy("skaffold " + a0 + " changes cluster state");
      return null;
    case "argocd":
      if (a0 === "app" && ["sync", "delete", "rollback", "set"].includes(a1)) return deploy("argocd app " + a1 + " changes a deployment");
      return null;
    case "npm":
    case "pnpm":
    case "yarn":
    case "bun":
      if (a0 === "publish" || (a0 === "npm" && a1 === "publish")) return deploy(cmd + " publish releases a package publicly");
      return null;
    case "cargo":
      if (a0 === "publish") return deploy("cargo publish releases a crate publicly");
      return null;
    case "twine":
      if (a0 === "upload") return deploy("twine upload releases a package publicly");
      return null;
    case "gh":
      if (a0 === "release" && ["create", "delete", "upload", "edit"].includes(a1)) return deploy("gh release " + a1 + " changes a public release");
      return null;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// Recursive delete

const DISPOSABLE = new Set([
  "node_modules", "dist", "build", "out", ".next", ".nuxt", ".turbo", ".cache", "coverage", ".nyc_output",
  ".pytest_cache", "__pycache__", ".mypy_cache", ".ruff_cache", "target", "tmp", ".tmp", "temp", "obj",
  ".parcel-cache", ".svelte-kit", ".output", ".vite", ".angular", "storybook-static", ".venv", "venv", ".tox",
  ".eggs", ".gradle", ".terraform", ".serverless", ".aws-sam", "cdk.out", ".webpack", ".expo", ".docusaurus",
  "htmlcov", ".hypothesis",
]);

function isTempPath(p) {
  const n = p.replace(/\\/g, "/");
  if (n.split("/").includes("..")) return false;
  const tmp = os.tmpdir().replace(/\\/g, "/").replace(/\/$/, "");
  const lower = n.toLowerCase();
  const prefixes = ["/tmp/", "/var/tmp/", "/private/tmp/", "$tmpdir/", "${tmpdir}/", "%temp%/", "%tmp%/", "$env:temp/", "$env:tmp/", "${env:temp}/"];
  if (prefixes.some((pre) => lower.startsWith(pre) && lower.length > pre.length)) return true;
  if (tmp && lower.startsWith(tmp.toLowerCase() + "/") && lower.length > tmp.length + 1) return true;
  if (/\/appdata\/local\/temp\/./.test(lower)) return true;
  return false;
}

function isDisposableTarget(target) {
  if (!target) return false;
  if (isTempPath(target)) return true;
  let t = target.replace(/\\/g, "/");
  if (t.includes("$") || t.includes("%") || t.startsWith("~")) return false;
  if (t.startsWith("/") || /^[A-Za-z]:/.test(t)) return false;
  t = t.replace(/^(\.\/)+/, "").replace(/\/\*$/, "").replace(/\/+$/, "");
  if (!t || t === "." || t === "*") return false;
  const parts = t.split("/");
  if (parts.includes("..")) return false;
  const last = parts[parts.length - 1];
  if (/\.egg-info$/.test(last) || /\.tsbuildinfo$/.test(last)) return true;
  return DISPOSABLE.has(last.toLowerCase());
}

const PS_RECURSE = /^-r(e(c(u(r(s(e)?)?)?)?)?)?(:\$true)?$/i;
const PS_LISTERS = ["get-childitem", "gci", "ls", "dir", "get-item", "gi"];

// Roots of a recursive listing that feeds a delete through a pipe:
// "Get-ChildItem src -Recurse | Remove-Item", "find src -type f | xargs rm".
// Returns null when the previous segment is not such a listing.
function pipedListingRoots(piped, shell) {
  if (!piped || !piped.cmd) return null;
  if (shell === "powershell" && PS_LISTERS.includes(piped.cmd)) {
    if (!piped.args.some((a) => PS_RECURSE.test(a))) return null;
    const roots = [];
    for (let i = 0; i < piped.args.length; i += 1) {
      const a = piped.args[i];
      if (/^-(path|literalpath|lp)$/i.test(a)) {
        if (piped.args[i + 1]) roots.push(piped.args[i + 1]);
        i += 1;
      } else if (/^-(include|exclude|filter|depth|attributes)$/i.test(a)) i += 1;
      else if (!a.startsWith("-")) roots.push(a);
    }
    return roots.length ? roots : ["."];
  }
  if (piped.cmd === "find") {
    const roots = [];
    for (const a of piped.args) {
      if (a.startsWith("-") || a === "(" || a === "!") break;
      roots.push(a);
    }
    return roots.length ? roots : ["."];
  }
  return null;
}

function classifyDelete(cmd, args, shell, piped) {
  const ps = shell === "powershell";
  const psDelete = ["remove-item", "ri", "del", "erase", "rd", "rmdir", "rm"];
  if (piped && (cmd === "rm" || (ps && psDelete.includes(cmd)))) {
    const roots = pipedListingRoots(piped, shell);
    if (roots && !roots.every(isDisposableTarget)) {
      return ask("recursive-delete", "deletes everything a recursive listing of " + roots.join(", ") + " returns");
    }
  }
  if (ps && psDelete.includes(cmd) && !args.some((a) => /^\/s$/i.test(a))) {
    const recurse = args.some((a) => PS_RECURSE.test(a) || /^-rf$/i.test(a));
    if (!recurse) return null;
    const targets = [];
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i];
      if (/^-(path|literalpath|lp|pspath)$/i.test(a)) {
        if (args[i + 1]) targets.push(args[i + 1]);
        i += 1;
        continue;
      }
      if (/^-(include|exclude|filter)$/i.test(a)) {
        i += 1;
        continue;
      }
      if (a.startsWith("-")) continue;
      targets.push(a);
    }
    const split = targets.flatMap((t) => t.split(",").map((x) => x.trim()).filter(Boolean));
    if (split.length && split.every(isDisposableTarget)) return null;
    return ask("recursive-delete", "recursive delete of " + (split.join(", ") || "an unspecified path"));
  }
  if (cmd === "rm") {
    let recursive = false;
    const targets = [];
    let endOpts = false;
    for (const a of args) {
      if (!endOpts && a === "--") {
        endOpts = true;
        continue;
      }
      if (!endOpts && a.startsWith("--")) {
        if (a === "--recursive") recursive = true;
        continue;
      }
      if (!endOpts && /^-[A-Za-z]+$/.test(a)) {
        if (/[rR]/.test(a)) recursive = true;
        continue;
      }
      targets.push(a);
    }
    if (!recursive) return null;
    if (targets.length && targets.every(isDisposableTarget)) return null;
    return ask("recursive-delete", "rm -r of " + (targets.join(" ") || "paths that are not known in advance"));
  }
  if (cmd === "rmdir" || cmd === "rd") {
    // cmd.exe: rmdir /s /q path
    if (!args.some((a) => /^\/s$/i.test(a))) return null;
    const targets = args.filter((a) => !/^\/[a-z]$/i.test(a));
    if (targets.length && targets.every(isDisposableTarget)) return null;
    return ask("recursive-delete", cmd + " /s of " + (targets.join(" ") || "an unspecified path"));
  }
  if (cmd === "del" && args.some((a) => /^\/s$/i.test(a))) {
    return ask("recursive-delete", "del /s deletes files recursively");
  }
  if (cmd === "find") {
    if (args.includes("-delete") || args.some((a, i) => (a === "-exec" || a === "-execdir") && /^(rm|rmdir)$/.test(baseName(args[i + 1] || "")))) {
      const roots = [];
      for (const a of args) {
        if (a.startsWith("-") || a === "(" || a === "!") break;
        roots.push(a);
      }
      if (roots.length && roots.every(isDisposableTarget)) return null;
      return ask("recursive-delete", "find ... -delete removes files recursively under " + (roots.join(" ") || "."));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Strict-only: dependencies and remote scripts

function classifyDependency(cmd, args) {
  const la = lowerArgs(args);
  const nf = nonFlags(la);
  const a0 = nf[0] || "";
  const a1 = nf[1] || "";
  const dep = (r) => ask("dependency-change", r);
  switch (cmd) {
    case "npm":
      if (["install", "i", "in", "ins", "add", "ci", "uninstall", "un", "remove", "rm", "r", "update", "up", "upgrade", "isntall"].includes(a0)) return dep("npm " + a0 + " changes dependencies");
      return null;
    case "pnpm":
    case "bun":
      if (["install", "i", "add", "remove", "rm", "uninstall", "un", "update", "up", "upgrade"].includes(a0)) return dep(cmd + " " + a0 + " changes dependencies");
      return null;
    case "yarn":
      if (!nf.length && !la.length) return dep("yarn installs dependencies");
      if (["add", "remove", "upgrade", "up", "install", "upgrade-interactive", "dedupe"].includes(a0)) return dep("yarn " + a0 + " changes dependencies");
      return null;
    case "pip":
    case "pip3":
    case "pipx":
      if (["install", "uninstall"].includes(a0)) return dep(cmd + " " + a0 + " changes packages");
      return null;
    case "uv":
      if (["add", "remove", "sync"].includes(a0) || (a0 === "pip" && ["install", "uninstall", "sync"].includes(a1)) || (a0 === "tool" && a1 === "install") || (a0 === "lock" && la.includes("--upgrade"))) return dep("uv " + a0 + " changes dependencies");
      return null;
    case "poetry":
    case "pdm":
      if (["add", "remove", "install", "update", "lock", "sync"].includes(a0)) return dep(cmd + " " + a0 + " changes dependencies");
      return null;
    case "pipenv":
      if (["install", "uninstall", "update", "upgrade", "sync"].includes(a0)) return dep("pipenv " + a0 + " changes dependencies");
      return null;
    case "cargo":
      if (["add", "remove", "rm", "install", "update", "uninstall"].includes(a0)) return dep("cargo " + a0 + " changes dependencies");
      return null;
    case "go":
      if (a0 === "get" || a0 === "install" || (a0 === "mod" && a1 === "tidy")) return dep("go " + a0 + " changes dependencies");
      return null;
    case "gem":
      if (["install", "uninstall", "update"].includes(a0)) return dep("gem " + a0 + " changes packages");
      return null;
    case "bundle":
    case "bundler":
      if (["install", "update", "add", "remove"].includes(a0) || !nf.length) return dep("bundle " + (a0 || "install") + " changes dependencies");
      return null;
    case "composer":
      if (["require", "install", "update", "remove", "upgrade"].includes(a0)) return dep("composer " + a0 + " changes dependencies");
      return null;
    case "dotnet":
      if ((["add", "remove"].includes(a0) && nf.includes("package")) || a0 === "restore" || (a0 === "tool" && ["install", "update", "uninstall"].includes(a1))) return dep("dotnet " + a0 + " changes packages");
      return null;
    case "apt":
    case "apt-get":
    case "dnf":
    case "yum":
    case "apk":
    case "brew":
    case "choco":
    case "winget":
    case "scoop":
    case "snap":
    case "pacman":
      if (["install", "add", "remove", "uninstall", "purge", "upgrade", "update", "del", "reinstall"].includes(a0) || la.some((a) => /^-S/.test(a) || a === "-r")) return dep(cmd + " " + (a0 || "") + " changes system packages");
      return null;
    case "install-module":
    case "install-package":
    case "uninstall-module":
    case "update-module":
    case "install-script":
      return dep(cmd + " changes PowerShell packages");
    default:
      return null;
  }
}

const DOWNLOADERS = /\b(curl|wget|iwr|irm|invoke-webrequest|invoke-restmethod|fetch)\b/i;
const INTERPRETERS = /^(sh|bash|zsh|dash|ksh|fish|python|python3|py|node|perl|ruby|iex|invoke-expression|pwsh|powershell|cmd)$/i;

function classifyRemoteScript(raw, segments) {
  for (let i = 1; i < segments.length; i += 1) {
    const s = segments[i];
    if (s.sep !== "|") continue;
    const target = unwrap(s.words.map((w) => w.value));
    const prevWords = segments[i - 1].words.map((w) => w.value).join(" ");
    if (INTERPRETERS.test(target.cmd) && DOWNLOADERS.test(prevWords)) return ask("remote-script", "pipes a downloaded script into " + target.cmd);
  }
  if (/\b(ba|z|da)?sh\s+<\(\s*(curl|wget)\b/i.test(raw)) return ask("remote-script", "runs a downloaded script via process substitution");
  if (/\b(ba|z)?sh\s+-c\s+["']?\$\(\s*(curl|wget)\b/i.test(raw)) return ask("remote-script", "runs a downloaded script via sh -c");
  if (/\b(iex|invoke-expression)\b[\s(]*.*\b(irm|iwr|invoke-webrequest|invoke-restmethod|downloadstring)\b/i.test(raw)) return ask("remote-script", "runs a downloaded PowerShell script");
  return null;
}

// ---------------------------------------------------------------------------
// Nested commands (bash -c, powershell -Command, ssh, kubectl exec, docker exec)

function nestedCommand(u) {
  const { cmd, args } = u;
  if (["bash", "sh", "zsh", "dash", "ksh"].includes(cmd)) {
    const i = args.findIndex((a) => /^-[a-z]*c[a-z]*$/.test(a));
    if (i !== -1 && args[i + 1] !== undefined) return { text: args[i + 1], shell: "bash" };
    return null;
  }
  if (cmd === "powershell" || cmd === "pwsh") {
    for (let i = 0; i < args.length; i += 1) {
      const a = args[i].toLowerCase();
      if (/^-(c|command)$/.test(a)) return { text: args.slice(i + 1).join(" "), shell: "powershell" };
      if (/^-(e|ec|enc|encodedcommand)$/.test(a) && args[i + 1]) {
        try {
          return { text: Buffer.from(args[i + 1], "base64").toString("utf16le"), shell: "powershell" };
        } catch (err) {
          return null;
        }
      }
    }
    // powershell "Remove-Item ..." with no flag: the rest is the command
    const rest = args.filter((a) => !a.startsWith("-"));
    if (rest.length && !/\.ps1$/i.test(rest[0])) return { text: rest.join(" "), shell: "powershell" };
    return null;
  }
  if (cmd === "cmd") {
    const i = args.findIndex((a) => /^\/[ck]$/i.test(a));
    if (i !== -1) return { text: args.slice(i + 1).join(" "), shell: "cmd" };
    return null;
  }
  if (cmd === "eval" && args.length) return { text: args.join(" "), shell: "bash" };
  if (cmd === "watch") {
    // watch [-n secs] [flags] <command...> runs the joined words through sh -c
    let i = 0;
    while (i < args.length && args[i].startsWith("-")) i += /^(-n|--interval|-q|--equexit)$/.test(args[i]) ? 2 : 1;
    return i < args.length ? { text: args.slice(i).join(" "), shell: "bash" } : null;
  }
  if (cmd === "invoke-expression" || cmd === "iex") {
    const i = args.findIndex((a) => /^-command$/i.test(a));
    const text = i !== -1 ? args.slice(i + 1).join(" ") : args.join(" ");
    return text ? { text, shell: "powershell" } : null;
  }
  if (cmd === "ssh") {
    const valued = new Set(["-i", "-p", "-l", "-o", "-F", "-J", "-L", "-R", "-D", "-b", "-c", "-E", "-e", "-m", "-O", "-Q", "-S", "-W", "-w", "-B"]);
    let i = 0;
    while (i < args.length && args[i].startsWith("-")) i += valued.has(args[i]) ? 2 : 1;
    const remote = args.slice(i + 1);
    if (remote.length) return { text: remote.join(" "), shell: "bash" };
    return null;
  }
  if (cmd === "kubectl" || cmd === "oc") {
    if ((nonFlags(args)[0] || "") === "exec") {
      const dd = args.indexOf("--");
      if (dd !== -1 && args.length > dd + 1) return { argv: args.slice(dd + 1) };
    }
    return null;
  }
  if (cmd === "docker" || cmd === "podman" || cmd === "docker-compose") {
    let rest = args;
    if (cmd !== "docker-compose" && rest[0] === "compose") rest = rest.slice(1);
    // skip compose global flags like -f file / -p name
    while (rest.length && rest[0].startsWith("-")) rest = rest.slice(/^-(f|p)$|^--(file|project-name|env-file|profile)$/.test(rest[0]) ? 2 : 1);
    if (rest[0] !== "exec" && rest[0] !== "run") return null;
    rest = rest.slice(1);
    const valued = /^-(e|u|w)$|^--(env|user|workdir|env-file|name|network|entrypoint|volume|mount|label)$|^-v$|^-p$|^--publish$/;
    while (rest.length && rest[0].startsWith("-")) rest = rest.slice(valued.test(rest[0]) ? 2 : 1);
    rest = rest.slice(1); // container, service or image
    if (rest.length) return { argv: rest };
    return null;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Main classifier

function classifySegment(seg, prevSeg, ctx, depth) {
  const values = seg.words.map((w) => w.value);
  if (!values.length) return null;
  const u = unwrap(values);
  if (!u.cmd) return null;
  const shell = ctx.shell;
  const mode = ctx.mode;

  const nested = depth < MAX_DEPTH ? nestedCommand(u) : null;
  if (nested) {
    const inner = nested.argv
      ? classifySegment({ words: nested.argv.map((v) => ({ value: v })), sep: null, redirs: [], heredoc: null, herestring: null }, null, ctx, depth + 1)
      : classifyText(nested.text, { shell: nested.shell, mode }, depth + 1);
    if (inner && inner.decision === "ask") return inner;
  }

  const cmd = u.cmd;
  const args = u.args;

  if (cmd === "git") {
    const r = classifyGit(args, mode);
    if (r) return r;
  }
  const mig = classifyMigration(cmd, args);
  if (mig) return mig;

  if (u.script !== undefined) {
    const r = classifyScriptName(cmd + " run", u.script);
    if (r) return r;
  }
  if (u.scriptCandidate !== undefined) {
    const r = classifyScriptName(values[0] && baseName(values[0]), u.scriptCandidate);
    if (r) return r;
  }
  if (["make", "just", "task", "mage", "invoke", "nx", "turbo"].includes(cmd)) {
    const targets = nonFlags(args);
    const runIdx = (cmd === "nx" || cmd === "turbo") && targets[0] === "run" ? 1 : 0;
    for (const t of targets.slice(runIdx)) {
      const r = classifyScriptName(cmd, t);
      if (r) return r;
    }
  }

  if (SQL_CLIENTS.has(cmd)) {
    const r = classifySqlClient(cmd, args, seg, prevSeg);
    if (r) return r;
  }
  const dep = classifyDeploy(cmd, args);
  if (dep) return dep;
  const piped = seg.sep === "|" && prevSeg ? unwrap(prevSeg.words.map((w) => w.value)) : null;
  const del = classifyDelete(cmd, args, shell, piped);
  if (del) return del;

  if (mode === "strict") {
    const d = classifyDependency(cmd, args);
    if (d) return d;
  }
  return null;
}

function classifyText(command, ctx, depth) {
  const { segments, subs } = tokenize(command, ctx.shell);
  for (let i = 0; i < segments.length; i += 1) {
    const r = classifySegment(segments[i], i > 0 ? segments[i - 1] : null, ctx, depth);
    if (r) return r;
  }
  if (depth < MAX_DEPTH) {
    for (const sub of subs) {
      const r = classifyText(sub, ctx, depth + 1);
      if (r && r.decision === "ask") return r;
    }
  }
  if (ctx.mode === "strict") {
    const r = classifyRemoteScript(command, segments);
    if (r) return r;
  }
  return null;
}

function classify(command, options) {
  const opts = options || {};
  const shell = String(opts.shell || "bash").toLowerCase() === "powershell" ? "powershell" : "bash";
  const mode = opts.mode === "strict" ? "strict" : "default";
  if (typeof command !== "string" || !command.trim()) return Object.assign({}, ALLOW, { reason: "empty command" });
  try {
    const r = classifyText(command, { shell, mode }, 0);
    return r || Object.assign({}, ALLOW);
  } catch (err) {
    // Never block on an internal error; the host's own permission checks still apply.
    return Object.assign({}, ALLOW, { reason: "guard could not parse the command: " + err.message });
  }
}

// ---------------------------------------------------------------------------
// CLI

const CLI_USAGE = 'Usage: node guard.js [--strict] [--shell bash|powershell] -- "<command>"\n' +
  "Prints {decision, category, reason} as JSON. Exit 0 = allow, 10 = ask, 2 = usage error.";

function cli(argv) {
  let mode = "default";
  let shell = "bash";
  const rest = [];
  let i = 0;
  for (; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--") {
      i += 1;
      break;
    }
    if (a === "--strict") mode = "strict";
    else if (a === "--shell") {
      shell = argv[i + 1];
      i += 1;
    } else if (a.startsWith("--shell=")) shell = a.slice(8);
    else if (a === "--help" || a === "-h") {
      process.stdout.write(CLI_USAGE + "\n");
      return 0;
    } else if (a === "--list-categories") {
      process.stdout.write(JSON.stringify(CATEGORIES, null, 2) + "\n");
      return 0;
    } else rest.push(a);
  }
  rest.push(...argv.slice(i));
  if (shell !== "bash" && shell !== "powershell") {
    process.stderr.write("--shell must be bash or powershell\n" + CLI_USAGE + "\n");
    return 2;
  }
  const command = rest.join(" ");
  if (!command.trim()) {
    process.stderr.write(CLI_USAGE + "\n");
    return 2;
  }
  const result = classify(command, { shell, mode });
  process.stdout.write(JSON.stringify(result) + "\n");
  return result.decision === "ask" ? 10 : 0;
}

if (require.main === module) {
  process.exitCode = cli(process.argv.slice(2));
}

module.exports = {
  classify,
  CATEGORIES,
  categories: CATEGORIES.map((c) => c.id),
  tokenize,
  destructiveSql,
};
