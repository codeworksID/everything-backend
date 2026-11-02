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
  { id: "database-write", mode: "default", description: "Any SQL, MongoDB or Redis statement that is not a plain read (INSERT/UPDATE/DELETE with or without WHERE, DDL, GRANT, COPY, side-effect functions, EXPLAIN ANALYZE of a write), client meta-commands that run a shell or read files, SQL built from shell variables, SQL from a file or stdin, and database tools that write (dropdb, createdb, pg_restore -d, mongorestore, mysqladmin other than status commands)." },
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
        // A quoted delimiter (<<'EOF') turns off $var and $(...) expansion in the body.
        pendingHeredocs.push({ seg, delim: word.value.replace(/^-/, ""), literal: word.quoted });
        seg.expectHeredocDelim = false;
      } else if (seg.expectHerestring) {
        seg.herestring = word.value;
        seg.herestringExpands = !!word.expands;
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
      h.seg.heredocExpands = !h.literal && /\$[A-Za-z_{(]|`/.test(h.seg.heredoc);
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
          // In POSIX double quotes a backslash only escapes $ ` " \ and newline;
          // before anything else it stays literal (psql -c "\dt").
          if (escape === "\\" && !'$`"\\\n'.includes(s[i + 1])) word.value += "\\";
          word.value += s[i + 1];
          i += 2;
          continue;
        }
        if (s[i] === "$" && s[i + 1] === "(") {
          const r = readBalanced(s, i + 2, "(", ")");
          subs.push(r.body);
          word.value += s.slice(i, r.end);
          word.expands = true;
          i = r.end;
          continue;
        }
        if (!ps && s[i] === "`") {
          const end = s.indexOf("`", i + 1);
          const stop = end === -1 ? s.length : end;
          subs.push(s.slice(i + 1, stop));
          word.value += s.slice(i, stop + 1);
          word.expands = true;
          i = stop + 1;
          continue;
        }
        if (s[i] === "$" && /[A-Za-z_{]/.test(s[i + 1] || "")) word.expands = true;
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
      word.expands = true;
      i = r.end;
      continue;
    }
    if (!ps && c === "`") {
      const end = s.indexOf("`", i + 1);
      const stop = end === -1 ? s.length : end;
      subs.push(s.slice(i + 1, stop));
      addChar(s.slice(i, stop + 1), false);
      word.expands = true;
      i = stop + 1;
      continue;
    }
    if (c === "$" && /[A-Za-z_{]/.test(next || "")) {
      // $var / ${var}: the value is unknown to the guard
      addChar(c, false);
      word.expands = true;
      i += 1;
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
//
// Policy (tool-rules.md -> Always Ask First, <shared>/sql-safety.md): ask for any
// statement that is not provably a plain read. A WHERE clause never makes a write
// safe: "DELETE ... WHERE 1=1" deletes every row, and even a narrow write changes
// data the user may not want changed. Plain reads are allowed: SELECT / WITH /
// VALUES / TABLE / SHOW / DESCRIBE / plain EXPLAIN, read-only psql meta-commands,
// sqlite read-only dot-commands, MongoDB finds and aggregations without $out or
// $merge, and Redis read commands. Anything unknown asks.
//
// The text is lexed once per dialect the client may speak (comment syntax, string
// escapes, identifier quotes and client meta-commands differ between servers and
// server settings), and the guard asks if ANY reading finds something that is not
// a plain read. A trick that hides a write from one lexer (a quote inside a
// comment, a backslash before a quote, a MySQL "#" or "/*! */" comment, a nested
// PostgreSQL comment) is still seen by the lexer that matches the server.
//
// Known limits, by design:
// - SELECT f(x) with a user-defined or extension function is allowed: the guard
//   cannot know whether f writes. Known side-effect functions ask (SIDE_EFFECT_NAMES).
//   Asking for every unknown function would make everyday reads noisy.
// - A search_path set through PGOPTIONS or a role default can make a built-in
//   name resolve to a user function; same limit.
// - Client option files (~/.psqlrc, ~/.my.cnf init-command) are not read.
// - mongosh runs JavaScript: the guard asks for known write methods, computed
//   method calls, load/require/eval and $out/$merge, but cannot prove a script is
//   read-only.

const SIDE_EFFECT_NAMES = [
  "NEXTVAL", "SETVAL", "SET_CONFIG", "PG_TERMINATE_BACKEND", "PG_CANCEL_BACKEND", "PG_RELOAD_CONF",
  "PG_ROTATE_LOGFILE", "PG_DROP_[A-Z_]+", "PG_CREATE_[A-Z_]+", "PG_COPY_[A-Z_]+", "PG_(?:TRY_)?ADVISORY_[A-Z_]*",
  "PG_REPLICATION_[A-Z_]+", "PG_LOGICAL_[A-Z_]+", "PG_STAT_RESET[A-Z_]*", "PG_(?:SET|CLEAR|RESTORE)_[A-Z_]+",
  "PG_NOTIFY", "PG_BACKUP_[A-Z_]+", "PG_(?:START|STOP)_BACKUP", "PG_WAL_REPLAY_[A-Z_]+", "PG_SWITCH_(?:WAL|XLOG)",
  "PG_PROMOTE", "PG_IMPORT_SYSTEM_COLLATIONS", "PG_EXTENSION_CONFIG_DUMP", "PG_WRITE_[A-Z_]+", "PG_FILE_[A-Z_]+",
  "LO_[A-Z0-9_]+", "LOWRITE", "DBLINK[A-Z_]*", "QUERY_TO_XML[A-Z_]*", "CURSOR_TO_XML[A-Z_]*",
  "SYS_EXEC", "SYS_EVAL", "SLEEP", "PG_SLEEP[A-Z_]*", "BENCHMARK", "GET_LOCK", "RELEASE_LOCK", "RELEASE_ALL_LOCKS",
  "LOAD_FILE", "LOAD_EXTENSION", "WRITEFILE", "EDIT", "FTS3_TOKENIZER",
  "XP_[A-Z_]+", "SP_[A-Z_]+", "OPENQUERY", "OPENROWSET", "OPENDATASOURCE",
].join("|");
// Functions that change state (or stall the server) even inside a SELECT.
const SIDE_EFFECT_FUNCS = new RegExp("\\b(" + SIDE_EFFECT_NAMES + ")\\s*\\(");
const SIDE_EFFECT_NAME = new RegExp("^(" + SIDE_EFFECT_NAMES + ")$");
// Statements that can hide inside a read: PostgreSQL data-modifying CTEs, and
// T-SQL batches, which need no ";" between statements ("SELECT 1 DROP TABLE t").
// INSERT( and REPLACE( / TRUNCATE( are MySQL string and number functions.
const IN_QUERY_WRITE = /\b(INSERT(?!\s*\()|UPDATE|DELETE|MERGE|UPSERT|REPLACE\s+INTO|TRUNCATE\s+TABLE|DROP|ALTER|CREATE|GRANT|REVOKE|DENY|COPY|CALL|EXEC|EXECUTE|DBCC|BULK|BACKUP\s+(?:DATABASE|LOG)|RESTORE\s+(?:DATABASE|LOG)|SHUTDOWN|KILL|RECONFIGURE|CHECKPOINT|WRITETEXT|UPDATETEXT|RECEIVE|SEND\s+ON|(?:ENABLE|DISABLE)\s+TRIGGER)\b/;
const TX_CONTROL = /^(BEGIN|START\s+TRANSACTION|COMMIT|END|ROLLBACK|ABORT|SAVEPOINT|RELEASE)\b/;
const READ_PRAGMA_WITH_ARG = /^(TABLE_INFO|TABLE_XINFO|TABLE_LIST|INDEX_INFO|INDEX_XINFO|INDEX_LIST|FOREIGN_KEY_LIST|FOREIGN_KEY_CHECK|INTEGRITY_CHECK|QUICK_CHECK)$/;
const WRITE_PRAGMA = /^(OPTIMIZE|WAL_CHECKPOINT|INCREMENTAL_VACUUM|SHRINK_MEMORY)$/;

// Lexer settings per dialect. backslash: "\" escapes inside '...' strings.
const SQL_DIALECTS = {
  pg: { nest: true, eStrings: true, dollar: true, client: "psql" },
  pgBackslash: { nest: true, eStrings: true, dollar: true, backslash: true, client: "psql" }, // standard_conforming_strings=off
  mysql: { hash: true, dashSpace: true, backslash: true, dqString: true, backtick: true, execComment: true, client: "mysql" },
  mysqlNoBackslash: { hash: true, dashSpace: true, dqString: true, backtick: true, execComment: true, client: "mysql" }, // NO_BACKSLASH_ESCAPES / ANSI_QUOTES
  sqlite: { backtick: true, brackets: true, client: "sqlite" },
  duckdb: { nest: true, eStrings: true, dollar: true, client: "sqlite" },
  tsql: { nest: true, brackets: true, client: "sqlcmd" },
  chMysql: { hash: true, backslash: true, dqString: true, backtick: true, client: null },
  chPg: { nest: true, backslash: true, backtick: true, client: null },
};
const CLIENT_DIALECTS = {
  psql: ["pg", "pgBackslash"],
  cockroach: ["pg", "pgBackslash"],
  mysql: ["mysql", "mysqlNoBackslash"],
  mariadb: ["mysql", "mysqlNoBackslash"],
  sqlite3: ["sqlite"],
  sqlite: ["sqlite"],
  duckdb: ["duckdb"],
  sqlcmd: ["tsql"],
  "invoke-sqlcmd": ["tsql"],
  "clickhouse-client": ["chMysql", "chPg"],
};
const DEFAULT_DIALECTS = ["pg", "pgBackslash", "mysql", "mysqlNoBackslash", "sqlite", "tsql"];
const IDENT_CHAR = /[A-Za-z0-9_$\u0080-￿]/;

// psql meta-commands that only read, format or change session display.
const PSQL_SAFE_META = /^(d[A-Za-z]*\+*|l\+*|list\+*|x|timing|conninfo|c|connect|encoding|pset|a|t|H|C|f|T|z\+*|sf\+*|sv\+*|\?|h|help|q|quit|errverbose|echo|qecho|warn|set|unset|g|gx|gset|gdesc|watch|crosstabview|p|print|r|reset|if|elif|else|endif|getenv|bind|bind_named|parse|close|close_prepared|lo_list|startpipeline|endpipeline|syncpipeline|sendpipeline|flushrequest|flush|getresults|restrict|unrestrict|copyright|\\)$/;
const PSQL_TERMINATOR = /^(g|gx|gset|gexec|gdesc|crosstabview|watch)$/;
// mysql client backslash commands that do not run a shell, read a file or write one.
const MYSQL_SAFE_META = /^[gGcqsuh?#RWwtnCpxr]$/;
const SQLITE_SAFE_DOT = /^(tables|table|schema|fullschema|indexes|indices|headers|header|mode|help|show|databases|dbinfo|timer|width|nullvalue|separator|explain|eqp|stats|changes|echo|print|prompt|bail|quit|exit|lint|version|vfsinfo|vfslist|vfsname|limit|scanstats|crnl|binary|parameter|sha3sum|dump|columns|maxrows|maxwidth|rows|highlight|last|timeout)$/i;
const SQLCMD_SAFE = /^:(setvar|listvar|help|list|reset|on|xml|serverlist|quit)$/i;

function escapeRegExp(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Index just past a quoted token that starts at s[i]; s.length if unterminated
// (the rest of the text then cannot run as a separate statement anyway).
function skipQuoted(s, i, close, backslash) {
  let j = i + 1;
  while (j < s.length) {
    const c = s[j];
    if (backslash && c === "\\") {
      j += 2;
      continue;
    }
    if (c === close) {
      if (s[j + 1] === close) {
        j += 2;
        continue;
      }
      return j + 1;
    }
    j += 1;
  }
  return s.length;
}

// Reduces SQL text to code: comments become spaces, string literals become '',
// quoted identifiers become "x", client meta-commands are collected separately
// (and \g-style terminators become ";"). Statements stay separated by ";".
function lexSql(text, d, extra) {
  const s = String(text);
  const n = s.length;
  let out = "";
  const metas = [];
  const calls = []; // quoted identifiers used as function names: "nextval"(...)
  let vars = false; // psql :name interpolation
  let pending = false; // code since the last ";" (sqlite dot-commands need an empty buffer)
  let inExec = false; // inside a MySQL /*! ... */ executable comment
  let lineStart = true;
  let i = 0;

  function identifier(name, end) {
    out += '"x"';
    pending = true;
    let k = end;
    while (k < n && /\s/.test(s[k])) k += 1;
    if (s[k] === "(") calls.push(name);
  }

  while (i < n) {
    const c = s[i];
    const c1 = s[i + 1];
    if (lineStart) {
      lineStart = false;
      let j = i;
      while (j < n && (s[j] === " " || s[j] === "\t" || s[j] === "\r")) j += 1;
      let eol = s.indexOf("\n", j);
      if (eol === -1) eol = n;
      const line = s.slice(j, eol);
      if (d.client === "sqlite" && !pending && !inExec) {
        if (line.startsWith(".")) {
          metas.push({ client: "sqlite", name: (/^\.(\S*)/.exec(line) || ["", ""])[1], text: line.trim() });
          out += ";";
          i = eol;
          continue;
        }
        if (line.startsWith("#")) {
          i = eol;
          continue;
        }
      }
      if (d.client === "sqlcmd" && extra.goLine && extra.goLine.test(line)) {
        out += ";";
        pending = false;
        i = eol;
        continue;
      }
    }
    if (c === "\n") {
      out += "\n";
      lineStart = true;
      i += 1;
      continue;
    }
    // comments
    if (c === "-" && c1 === "-" && (!d.dashSpace || i + 2 >= n || /[\s\x00-\x1f]/.test(s[i + 2]))) {
      while (i < n && s[i] !== "\n") i += 1;
      out += " ";
      continue;
    }
    if (c === "#" && d.hash) {
      while (i < n && s[i] !== "\n") i += 1;
      out += " ";
      continue;
    }
    if (c === "/" && c1 === "*") {
      if (d.execComment && !inExec && (s[i + 2] === "!" || (s[i + 2] === "M" && s[i + 3] === "!"))) {
        // MySQL/MariaDB run the body of /*! ... */ and /*M! ... */ as SQL.
        i += s[i + 2] === "!" ? 3 : 4;
        while (i < n && /[0-9]/.test(s[i])) i += 1;
        inExec = true;
        out += " ";
        continue;
      }
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (s[i] === "*" && s[i + 1] === "/") {
          depth -= 1;
          i += 2;
        } else if (d.nest && s[i] === "/" && s[i + 1] === "*") {
          depth += 1;
          i += 2;
        } else i += 1;
      }
      out += " ";
      continue;
    }
    if (inExec && c === "*" && c1 === "/") {
      inExec = false;
      i += 2;
      out += " ";
      continue;
    }
    // string literals and quoted identifiers
    if (c === "'") {
      const p = s[i - 1];
      const eString = d.eStrings && (p === "e" || p === "E") && !(i > 1 && IDENT_CHAR.test(s[i - 2]));
      i = skipQuoted(s, i, "'", d.backslash || eString);
      out += "''";
      pending = true;
      continue;
    }
    if (c === '"') {
      if (d.dqString) {
        i = skipQuoted(s, i, '"', d.backslash);
        out += "''";
        pending = true;
        continue;
      }
      const end = skipQuoted(s, i, '"', false);
      identifier(s.slice(i + 1, end - 1), end);
      i = end;
      continue;
    }
    if (c === "`" && d.backtick) {
      const end = skipQuoted(s, i, "`", false);
      identifier(s.slice(i + 1, end - 1), end);
      i = end;
      continue;
    }
    if (c === "[" && d.brackets) {
      const end = skipQuoted(s, i, "]", false);
      identifier(s.slice(i + 1, end - 1), end);
      i = end;
      continue;
    }
    if (c === "$" && d.dollar && !(i > 0 && IDENT_CHAR.test(s[i - 1]))) {
      const m = /^\$([A-Za-z_\u0080-￿][A-Za-z0-9_\u0080-￿]*)?\$/.exec(s.slice(i, i + 200));
      if (m) {
        const close = s.indexOf(m[0], i + m[0].length);
        i = close === -1 ? n : close + m[0].length;
        out += "''";
        pending = true;
        continue;
      }
    }
    // client meta-commands
    if (c === "\\" && d.client === "mysql") {
      const name = c1 || "";
      metas.push({ client: "mysql", name, text: "\\" + name });
      const term = name === "g" || name === "G";
      out += term ? ";" : " ";
      if (term) pending = false;
      i += 2;
      continue;
    }
    if (c === "\\" && d.client === "psql") {
      // A meta-command runs to the end of the line or to the next backslash.
      const rest = s.slice(i + 1, i + 80);
      const name = (/^[A-Za-z][A-Za-z0-9_]*\+*/.exec(rest) || /^[^\n]?/.exec(rest))[0];
      const k = i + 1 + name.length;
      let eol = s.indexOf("\n", k);
      if (eol === -1) eol = n;
      let argsEnd = s.indexOf("\\", k);
      if (argsEnd === -1 || argsEnd > eol) argsEnd = eol;
      metas.push({ client: "psql", name, args: s.slice(k, argsEnd).trim(), text: "\\" + name });
      const term = PSQL_TERMINATOR.test(name);
      out += term ? ";" : " ";
      if (term) pending = false;
      i = argsEnd;
      continue;
    }
    if (c === ":" && d.client === "psql" && s[i - 1] !== ":" && c1 !== undefined && /[A-Za-z_'"{]/.test(c1)) vars = true;
    out += c;
    if (c === ";") pending = false;
    else if (!/\s/.test(c)) pending = true;
    i += 1;
  }
  return { code: out, metas, calls, vars };
}

function metaReason(m) {
  if (m.client === "psql") {
    if (!PSQL_SAFE_META.test(m.name)) return "runs the psql meta-command " + m.text + ", which can read or write files, run a shell or execute generated SQL";
    if ((m.name === "g" || m.name === "gx") && m.args) return "runs " + m.text + " with an argument, which writes the result to a file or a shell command";
    if (m.args && m.args.includes("`")) return "runs " + m.text + " with a backtick argument, which psql runs as a shell command";
    return null;
  }
  if (m.client === "mysql") {
    if (!MYSQL_SAFE_META.test(m.name)) return "runs the mysql client command " + m.text + ", which can run a shell, read a file, write a file or change the delimiter";
    return null;
  }
  if (m.client === "sqlite") {
    if (!SQLITE_SAFE_DOT.test(m.name)) return "runs the dot-command ." + m.name + ", which can read or write files, run a shell or change the database";
    return null;
  }
  return null;
}

// Why one normalized (upper-case, single-spaced) statement is not a plain read, or null.
function statementReason(st) {
  const fn = SIDE_EFFECT_FUNCS.exec(st);
  if (fn) return "calls " + fn[1] + "(), which has side effects";
  if (/\bNEXT\s+VALUE\s+FOR\b/.test(st)) return "runs NEXT VALUE FOR, which advances a sequence";
  const body = st.replace(/^(\(\s*)+/, "");
  const scan = (text) => {
    const w = IN_QUERY_WRITE.exec(text.replace(/\bFOR\s+(NO\s+KEY\s+)?UPDATE\b/g, " "));
    return w ? "runs " + w[1] + " inside the statement (any statement that is not a plain read asks first, with or without WHERE)" : null;
  };
  if (TX_CONTROL.test(body)) {
    if (/\bPREPARED\b/.test(body)) return "runs " + body.split(" ")[0] + " PREPARED, which finishes a two-phase transaction";
    return scan(body);
  }
  // EXPLAIN ANALYZE (and MySQL DESCRIBE ANALYZE) executes the statement; plain EXPLAIN does not.
  const ex = /^(EXPLAIN|DESCRIBE|DESC)\b(\s*\([^)]*\))?((\s+(ANALYZE|ANALYSE|VERBOSE|COSTS|BUFFERS|EXTENDED|PARTITIONS|QUERY PLAN|FORMAT\s*=?\s*\w+))*)\s*/.exec(body);
  if (ex) {
    const inner = body.slice(ex[0].length).replace(/^(\(\s*)+/, "");
    const options = (ex[2] || "") + (ex[3] || "");
    const isStatement = /^(SELECT|WITH|VALUES|TABLE|INSERT|UPDATE|DELETE|MERGE|REPLACE|UPSERT|EXECUTE|DECLARE|CREATE)\b/.test(inner);
    if (ex[1] !== "EXPLAIN" && !options && !isStatement) return scan(body); // DESCRIBE <table>
    if (!inner) return null;
    if (/\bANALY[SZ]E\b(?!\s+(FALSE|OFF|0)\b)/.test(options)) {
      const why = statementReason(inner);
      return why ? "runs EXPLAIN ANALYZE, which executes the statement: " + why : null;
    }
    return isStatement ? null : "runs EXPLAIN on an unrecognized statement";
  }
  if (/^(SELECT|WITH|VALUES|TABLE)\b/.test(body)) {
    const w = scan(body);
    if (w) return w;
    if (/\bINTO\s+(?![@:])\S/.test(body)) return "runs SELECT ... INTO, which creates a table or writes a file";
    return null;
  }
  if (/^SHOW\b/.test(body)) return scan(body.replace(/^SHOW\s+(FULL\s+)?CREATE\b/, "SHOW"));
  if (/^PRAGMA\b/.test(body)) {
    // "PRAGMA table_info(users)" and "PRAGMA foreign_keys" read; "PRAGMA x = y" and "PRAGMA user_version(5)" write.
    const p = /^PRAGMA\s+(?:\w+\.)?(\w+)\s*(=|\()?/.exec(body);
    if (!p || p[2] === "=" || (p[2] === "(" && !READ_PRAGMA_WITH_ARG.test(p[1])) || WRITE_PRAGMA.test(p[1])) return "runs a PRAGMA that changes the database or a setting";
    return scan(body);
  }
  if (/^SET\b/.test(body)) {
    // Session-level SET is harmless; GLOBAL/PERSIST change the server, PASSWORD/DEFAULT ROLE an account.
    if (/\b(GLOBAL|PERSIST|PERSIST_ONLY|PASSWORD|DEFAULT\s+ROLE)\b/.test(body)) return "runs SET GLOBAL, PERSIST, PASSWORD or DEFAULT ROLE, which changes the server or an account";
    return scan(body);
  }
  if (/^USE\s+\S+$/.test(body)) return null;
  if (/^DECLARE\b/.test(body)) return scan(body);
  const first = (/^[A-Z_]+(\s+[A-Z_]+)?/.exec(body) || ["an unrecognized statement"])[0];
  return "runs " + first + " (any statement that is not a plain read asks first, with or without WHERE)";
}

function dialectReason(text, d, extra) {
  const lx = lexSql(text, d, extra);
  for (const m of lx.metas) {
    const why = metaReason(m);
    if (why) return why;
  }
  if (lx.vars) return "uses a psql variable (:name) whose value was not checked";
  for (const name of lx.calls) {
    if (SIDE_EFFECT_NAME.test(name.toUpperCase()) || name.includes("\\")) return "calls " + name + "(), which has side effects";
  }
  for (const part of lx.code.split(";")) {
    const st = part.replace(/\s+/g, " ").trim().toUpperCase();
    if (!st) continue;
    const why = statementReason(st);
    if (why) return why;
  }
  return null;
}

// Returns why a SQL text is not provably read-only, or null if every statement is.
// opts.client picks the dialects to lex with (psql, mysql, sqlite3, sqlcmd, ...);
// without it every dialect is tried. opts.mongo checks MongoDB shell JavaScript.
function sqlWriteReason(text, opts) {
  if (!text) return null;
  const o = opts || {};
  const raw = String(text);
  if (o.mongo) return mongoWriteReason(raw);
  if (!o.client) {
    const mongo = mongoWriteReason(raw);
    if (mongo) return mongo;
  }
  const names = CLIENT_DIALECTS[o.client] || DEFAULT_DIALECTS;
  const extra = {};
  let texts = [raw];
  if (names.includes("tsql")) {
    // sqlcmd: ":r file", ":out", "!! cmd" and $(var) work anywhere, even inside a string.
    for (const line of raw.split(/\r?\n/)) {
      const t = line.trim();
      const m = /^(!!|:!!|:[A-Za-z]+)/.exec(t);
      if (m && !SQLCMD_SAFE.test(m[1])) return "runs the sqlcmd command " + m[1] + ", which can read a file, write a file or run a shell";
    }
    if (raw.includes("$(")) return "uses a sqlcmd variable $(name) whose value was not checked";
    extra.goLine = new RegExp("^\\s*" + escapeRegExp(o.batchSeparator || "GO") + "(\\s+\\d+)?\\s*$", "i");
    // Batches split at GO lines, whether or not the GO sits inside a string.
    texts = texts.concat(raw.split(/\r?\n/).reduce((acc, line) => {
      if (extra.goLine.test(line)) acc.push("");
      else acc[acc.length - 1] += line + "\n";
      return acc;
    }, [""]));
  }
  for (const name of names) {
    for (const t of texts) {
      const why = dialectReason(t, SQL_DIALECTS[name], extra);
      if (why) return why;
    }
  }
  return null;
}

const MONGO_WRITE = /\.\s*(insert|insertOne|insertMany|update|updateOne|updateMany|replaceOne|delete|deleteOne|deleteMany|remove|findOneAndUpdate|findOneAndReplace|findOneAndDelete|findAndModify|bulkWrite|mapReduce|drop|dropDatabase|dropIndex|dropIndexes|createIndex|createIndexes|createCollection|createView|renameCollection|runCommand|adminCommand|shutdownServer|createUser|dropUser|dropAllUsers|updateUser|changeUserPassword|createRole|dropRole|dropAllRoles|updateRole|grantRolesToUser|revokeRolesFromUser|grantRolesToRole|revokeRolesFromRole|grantPrivilegesToRole|revokePrivilegesFromRole|createSearchIndex|createSearchIndexes|dropSearchIndex|updateSearchIndex|hideIndex|unhideIndex|killOp|setProfilingLevel|setLogLevel|fsyncLock|fsyncUnlock|convertToCapped|compact|cloneCollection|copyDatabase|initializeOrderedBulkOp|initializeUnorderedBulkOp|save|eval)\b/i;

function mongoWriteReason(text) {
  const m = MONGO_WRITE.exec(text);
  if (m) return "runs the MongoDB write or admin method " + m[1] + "()";
  if (/["'`]?\$(out|merge)["'`]?\s*:/.test(text)) return "runs an aggregation with $out or $merge, which writes a collection";
  if (/\]\s*\(/.test(text) || /[\w$)\]]\s*\[\s*(?![\d'"\]])/.test(text) || /\[\s*['"`][^\]]*\+/.test(text)) {
    return "calls a method through a computed property, which the guard cannot check";
  }
  const js = /\b(load|require|eval|Function|import|constructor)\s*\(|\bprocess\s*\.\s*(?!env\b)\w|\bconstructor\b/.exec(text);
  if (js) return "runs " + js[0].trim() + ", which can load code, run a shell or hide a write";
  const rs = /\b(rs|sh)\.(\w+)\s*\(/.exec(text);
  if (rs && !/^(status|conf|config|printReplicationInfo|printSecondaryReplicationInfo|isMaster|hello|help|getBalancerState|isBalancerRunning)$/.test(rs[2])) {
    return "runs the replica set or sharding command " + rs[1] + "." + rs[2] + "()";
  }
  return null;
}

const REDIS_READ = new Set(["get", "mget", "exists", "type", "ttl", "pttl", "expiretime", "pexpiretime", "strlen", "getrange", "substr", "lcs", "keys", "scan", "sscan", "hscan", "zscan", "randomkey", "hget", "hmget", "hgetall", "hkeys", "hvals", "hlen", "hexists", "hstrlen", "hrandfield", "lrange", "llen", "lindex", "lpos", "smembers", "sismember", "smismember", "scard", "srandmember", "sinter", "sintercard", "sunion", "sdiff", "zrange", "zrangebyscore", "zrevrange", "zrevrangebyscore", "zrangebylex", "zrevrangebylex", "zscore", "zmscore", "zrank", "zrevrank", "zcard", "zcount", "zlexcount", "zrandmember", "zinter", "zunion", "zdiff", "zintercard", "xrange", "xrevrange", "xlen", "xinfo", "xpending", "xread", "info", "ping", "echo", "dbsize", "time", "lastsave", "role", "memory", "object", "slowlog", "latency", "client", "config", "command", "pubsub", "dump", "bitcount", "bitpos", "getbit", "bitfield_ro", "sort_ro", "pfcount", "geopos", "geodist", "geohash", "georadius_ro", "georadiusbymember_ro", "geosearch", "json.get", "json.mget", "json.type", "json.strlen", "json.arrlen", "json.objkeys", "json.objlen", "ft.search", "ft.info", "ft._list", "ft.aggregate", "ft.explain", "ft.profile", "select", "auth", "hello", "readonly", "lolwut"]);
const REDIS_WRITE_SUB = {
  client: /^(kill|pause|unpause|no-evict|no-touch|setname|setinfo|reply|tracking|caching|unblock)$/i,
  config: /^(set|rewrite|resetstat)$/i,
  memory: /^(purge)$/i,
  slowlog: /^(reset)$/i,
  latency: /^(reset)$/i,
};
// redis-cli options that take a value (the value is not the command).
const REDIS_VALUED = new Set(["-h", "-p", "-a", "-n", "-u", "-s", "-r", "-i", "-d", "-D", "-t", "--user", "--pass", "--tls-cert", "--tls-key", "--tls-ciphers", "--tls-ciphersuites", "--cacert", "--cacertdir", "--cert", "--key", "--sni", "--rdb", "--functions-rdb", "--pattern", "--quoted-pattern", "--count", "--eval", "--memkeys-samples", "--keystats-samples", "--lru-test", "--intrinsic-latency", "--cluster-replicas", "--top"]);

function redisWriteReason(args) {
  let i = 0;
  for (; i < args.length; i += 1) {
    const a = args[i];
    if (/^--(eval|pipe|rdb|functions-rdb|replica|slave)$/i.test(a)) return "redis-cli " + a + " runs a script, a bulk import or a replication stream";
    if (REDIS_VALUED.has(a)) {
      i += 1;
      continue;
    }
    if (a.startsWith("-")) continue;
    break;
  }
  if (i >= args.length) return null;
  const cmd = args[i].toLowerCase();
  const sub = (args[i + 1] || "").toLowerCase();
  if (!REDIS_READ.has(cmd)) return "runs the Redis command " + args[i].toUpperCase() + ", which is not a plain read";
  const subRule = REDIS_WRITE_SUB[cmd];
  if (subRule && subRule.test(sub)) return "runs Redis " + cmd.toUpperCase() + " " + sub.toUpperCase();
  return null;
}

const SQL_CLIENTS = new Set(["psql", "mysql", "mariadb", "sqlite3", "sqlite", "mongosh", "mongo", "sqlcmd", "cockroach", "clickhouse", "clickhouse-client", "clickhouse-local", "duckdb", "invoke-sqlcmd", "redis-cli", "dropdb", "createdb", "createuser", "dropuser", "vacuumdb", "reindexdb", "clusterdb", "pgbench", "mysqladmin", "mysqlimport", "mongoimport", "mongorestore", "pg_restore"]);
// Tools whose job is to change a database; they ask unless only asked for help or a version.
const DB_WRITE_TOOLS = new Set(["createdb", "createuser", "dropuser", "vacuumdb", "reindexdb", "clusterdb", "mysqlimport", "mongoimport", "mongorestore"]);
const MYSQLADMIN_READ = new Set(["status", "extended-status", "variables", "processlist", "ping", "version"]);

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

// Parses getopt-style options, including short bundles such as psql -tAc "SQL"
// and mysql -Ne "SQL". valued: short letters that take a value (attached or the
// next word); optional: letters whose value can only be attached (mysql -pSECRET);
// long: long options that take the next word as their value.
function parseOpts(args, spec) {
  const opts = [];
  const pos = [];
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === "--") {
      pos.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      let name = (eq === -1 ? a : a.slice(0, eq)).toLowerCase();
      // getopt_long and the MySQL clients accept an abbreviated long option (--exec=...).
      if (!spec.long.has(name) && name.length >= 4) name = [...spec.long].find((l) => l.startsWith(name)) || name;
      if (eq !== -1) opts.push({ name, value: a.slice(eq + 1) });
      else if (spec.long.has(name) && i + 1 < args.length) {
        opts.push({ name, value: args[i + 1] });
        i += 1;
      } else opts.push({ name, value: null });
      continue;
    }
    if (a.length > 1 && a[0] === "-") {
      for (let j = 1; j < a.length; j += 1) {
        const letter = a[j];
        if (spec.optional && spec.optional.has(letter)) {
          opts.push({ name: "-" + letter, value: a.slice(j + 1) });
          break;
        }
        if (spec.valued.has(letter)) {
          let value = a.slice(j + 1);
          if (!value && i + 1 < args.length) {
            value = args[i + 1];
            i += 1;
          }
          opts.push({ name: "-" + letter, value });
          break;
        }
        opts.push({ name: "-" + letter, value: null });
      }
      continue;
    }
    pos.push(a);
  }
  return { opts, pos };
}

function optValues(parsed, names) {
  return parsed.opts.filter((o) => names.includes(o.name) && o.value !== null).map((o) => o.value);
}

const PSQL_OPTS = { valued: new Set("cdfhLopPRTUvF".split("")), long: new Set(["--command", "--dbname", "--file", "--host", "--log-file", "--output", "--port", "--pset", "--record-separator", "--set", "--table-attr", "--username", "--variable", "--field-separator"]) };
const MYSQL_OPTS = { valued: new Set("DehPSu".split("")), optional: new Set(["p"]), long: new Set(["--execute", "--init-command", "--init_command", "--user", "--host", "--port", "--socket", "--database", "--default-character-set", "--protocol"]) };
const SQLITE_VALUED = new Set(["-cmd", "-c", "-s", "-f", "-separator", "-nullvalue", "-newline", "-init", "-vfs", "-maxsize", "-mmap", "-escape"]);
const SQLITE_VALUED2 = new Set(["-pagecache", "-lookaside"]);
const SQLCMD_VALUED = new Set("SUPdHltshwafoKMyYmVzZ".split(""));
const INVOKE_SQLCMD_VALUED = ["serverinstance", "database", "username", "password", "credential", "accesstoken", "querytimeout", "connectiontimeout", "errorlevel", "severitylevel", "maxcharlength", "maxbinarylength", "variable", "outputas", "connectionstring", "hostname", "newpassword", "applicationname", "applicationintent", "encrypt", "hostnameincertificate", "failoverpartner", "statisticsvariable", "keyvaultaccesstoken", "managedhsmaccesstoken", "erroraction", "warningaction", "informationaction", "errorvariable", "warningvariable", "informationvariable", "outvariable", "outbuffer", "pipelinevariable"];

// Where a command reads stdin from: "<" files, a heredoc, a here-string or a pipe.
function stdinOf(seg, prevSeg) {
  const redirs = (seg.redirs || []).filter((r) => r.op === "<" && r.target);
  const piped = seg.sep === "|" && prevSeg ? prevSeg : null;
  const heredoc = seg.heredoc === undefined ? null : seg.heredoc;
  const herestring = seg.herestring === undefined ? null : seg.herestring;
  if (!redirs.length && heredoc === null && herestring === null && !piped) return null;
  return { redirs, heredoc, heredocExpands: !!seg.heredocExpands, herestring, herestringExpands: !!seg.herestringExpands, piped };
}

function helpOnly(args) {
  return args.length > 0 && args.every((a) => /^(--help|-\?|--version|-V)$/.test(a));
}

function classifySqlClient(cmd, args, seg, input) {
  const stdin = input || { redirs: [], heredoc: null, herestring: null, piped: null };
  const db = (why) => ask("database-write", why);
  if (cmd === "redis-cli") {
    const why = redisWriteReason(args);
    if (why) return db("redis-cli " + why);
    if (stdin.piped || stdin.heredoc !== null || stdin.herestring !== null) return db("redis-cli reads commands from stdin; they were not checked");
    if (stdin.redirs.length) return db("redis-cli reads commands from a file; they were not checked");
    return null;
  }
  if (cmd === "dropdb") return db("dropdb drops a database");
  if (DB_WRITE_TOOLS.has(cmd)) return helpOnly(args) ? null : db(cmd + " changes a database (creates, drops, imports, restores or rewrites data)");
  if (cmd === "pgbench") {
    if (helpOnly(args)) return null;
    const selectOnly = args.some((a) => /^(-S|--select-only|--builtin=select-only)$/.test(a)) || /(^|\s)-b select-only(\s|$)/.test(args.join(" "));
    if (selectOnly && !args.some((a) => /^(-i|--initialize|-i\w+)$/.test(a))) return null;
    return db("pgbench initializes tables or runs a write workload");
  }
  if (cmd === "mysqladmin") {
    const p = parseOpts(args, { valued: new Set("uhPSci".split("")), optional: new Set(["p"]), long: new Set(["--user", "--host", "--port", "--socket", "--count", "--sleep"]) });
    const writes = p.pos.filter((a) => !MYSQLADMIN_READ.has(a.toLowerCase()));
    if (writes.length) return db("mysqladmin " + writes[0] + " is not a read-only admin command");
    return null;
  }
  if (cmd === "pg_restore") {
    if (args.some((a) => /^(-c|--clean)$/.test(a))) return db("pg_restore --clean drops existing objects before restoring");
    if (args.some((a) => /^(-d.*|--dbname(=.*)?)$/.test(a))) return db("pg_restore -d restores into a database, which writes to it");
    return null;
  }
  if (cmd === "cockroach") {
    if ((args[0] || "").toLowerCase() !== "sql") return null;
    args = args.slice(1);
  }
  if (cmd === "clickhouse") {
    if (!/^(client|local)$/i.test(args[0] || "")) return null;
    args = args.slice(1);
    cmd = "clickhouse-client";
  }
  if (cmd === "clickhouse-local") cmd = "clickhouse-client";

  const sql = []; // { text, fromArg } or { text, expands }
  let files = [];
  const opts = { client: cmd };
  const fromArgs = (values) => values.forEach((text) => sql.push({ text, fromArg: true }));
  switch (cmd) {
    case "psql": {
      const p = parseOpts(args, PSQL_OPTS);
      fromArgs(optValues(p, ["-c", "--command"]));
      files = optValues(p, ["-f", "--file"]);
      break;
    }
    case "mysql":
    case "mariadb": {
      const p = parseOpts(args, MYSQL_OPTS);
      fromArgs(optValues(p, ["-e", "--execute", "--init-command", "--init_command"]));
      break;
    }
    case "cockroach":
      fromArgs(flagValues(args, ["-e", "--execute"]));
      files = flagValues(args, ["-f", "--file"]);
      break;
    case "clickhouse-client": {
      const p = parseOpts(args, { valued: new Set("qdhu".split("")), long: new Set(["--query", "--queries-file", "--database", "--host", "--user", "--password", "--port", "--format", "--config-file"]) });
      fromArgs(optValues(p, ["-q", "--query"]));
      files = optValues(p, ["--queries-file"]);
      break;
    }
    case "sqlite3":
    case "sqlite":
    case "duckdb": {
      if (args.some((a) => /^(-A|--archive)/.test(a))) return db(cmd + " -A runs an archive command, which writes files or the database");
      const pos = [];
      for (let i = 0; i < args.length; i += 1) {
        const a = args[i];
        const flag = a.replace(/^--/, "-").toLowerCase();
        if (a.startsWith("-") && a.length > 1) {
          if (flag === "-cmd" || flag === "-c" || (cmd === "duckdb" && flag === "-s")) {
            if (i + 1 < args.length) sql.push({ text: args[i + 1], fromArg: true });
            i += 1;
          } else if (flag === "-init" || (cmd === "duckdb" && flag === "-f")) {
            if (i + 1 < args.length) files.push(args[i + 1]);
            i += 1;
          } else if (SQLITE_VALUED.has(flag)) i += 1;
          else if (SQLITE_VALUED2.has(flag)) i += 2;
          continue;
        }
        pos.push(a);
      }
      // Every argument after the database file is run separately (SQL or a dot-command).
      fromArgs(pos.slice(1));
      break;
    }
    case "mongosh":
    case "mongo":
      opts.mongo = true;
      fromArgs(flagValues(args, ["--eval"]));
      files = flagValues(args, ["-f", "--file"]).concat(nonFlags(args).filter((a) => /\.(js|mjs|cjs)$/i.test(a)));
      break;
    case "sqlcmd":
      // sqlcmd options are case-sensitive (-Q runs a query, -q too, -I is a switch) and also take "/".
      for (let i = 0; i < args.length; i += 1) {
        const m = /^[-/]([A-Za-z])(.*)$/.exec(args[i]);
        if (!m) continue;
        const [, letter, rest] = m;
        const value = () => (rest ? rest : (i += 1, args[i]));
        if (letter === "Q" || letter === "q") {
          const v = value();
          if (v !== undefined) sql.push({ text: v, fromArg: true });
        } else if (letter === "i") {
          const v = value();
          if (v !== undefined) files.push(v);
          while (i + 1 < args.length && !/^[-/]/.test(args[i + 1])) files.push(args[++i]);
        } else if (letter === "c") opts.batchSeparator = value();
        else if (letter === "v") {
          if (!rest) i += 1;
          while (i + 1 < args.length && args[i + 1].includes("=") && !/^[-/]/.test(args[i + 1])) i += 1;
        } else if (SQLCMD_VALUED.has(letter) && !rest) i += 1;
      }
      break;
    case "invoke-sqlcmd": {
      // PowerShell: -Query is also the first positional parameter, names can be
      // shortened to a unique prefix, and "-Query:value" is valid.
      let positional = false;
      for (let i = 0; i < args.length; i += 1) {
        const m = /^-([A-Za-z]+)(?::([\s\S]*))?$/.exec(args[i]);
        if (!m) {
          if (!positional) sql.push({ text: args[i], fromArg: true });
          positional = true;
          continue;
        }
        const name = m[1].toLowerCase();
        const value = () => (m[2] !== undefined ? m[2] : (i += 1, args[i]));
        if ("query".startsWith(name)) {
          const v = value();
          if (v !== undefined) sql.push({ text: v, fromArg: true });
        } else if (name.length >= 3 && "inputfile".startsWith(name)) {
          const v = value();
          if (v !== undefined) files.push(v);
        } else if (m[2] === undefined && INVOKE_SQLCMD_VALUED.some((p) => p.startsWith(name))) i += 1;
      }
      break;
    }
    default:
      return null;
  }
  for (const r of stdin.redirs) files.push(r.target);
  if (stdin.heredoc !== null) sql.push({ text: stdin.heredoc, expands: stdin.heredocExpands });
  if (stdin.herestring !== null) sql.push({ text: stdin.herestring, expands: stdin.herestringExpands });
  if (stdin.piped) {
    const prev = stdin.piped;
    const words = prev.words.map((w) => w.value);
    const prevExpands = prev.words.some((w) => w.expands);
    const pu = unwrap(words);
    const ps = /^@\r?\n([\s\S]*)\r?\n@$/.exec(words.length === 1 ? words[0] : "");
    if (ps) sql.push({ text: ps[1], expands: prevExpands }); // PowerShell here-string
    else if (prev.heredoc !== null && prev.heredoc !== undefined && !nonFlags(pu.args).length) sql.push({ text: prev.heredoc, expands: !!prev.heredocExpands });
    else if (["cat", "type", "get-content", "gc", "zcat", "gunzip", "bzcat", "xzcat"].includes(pu.cmd)) files.push(nonFlags(pu.args)[0] || "(stdin)");
    else if (["echo", "write-output"].includes(pu.cmd) && !pu.args.some((a) => a.includes("\\") || /^-[a-z]*e/i.test(a))) {
      sql.push({ text: pu.args.filter((a) => !/^-[nE]+$/.test(a)).join(" "), expands: prevExpands });
    } else sql.push({ text: words.join(" "), expands: prevExpands });
  }
  const expanding = seg.words.filter((w) => w.expands).map((w) => w.value);
  for (const item of sql) {
    const expands = item.fromArg ? item.text !== "" && expanding.some((w) => w.includes(item.text)) : item.expands;
    if (expands) return db(cmd + " runs SQL built from a shell variable or command substitution; its value was not checked");
    const why = sqlWriteReason(item.text, opts);
    if (why) return db(cmd + " " + why);
  }
  if (files.length) return db(cmd + " runs SQL from " + files.join(", ") + "; its contents were not checked");
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
  // stdin of this command, or of the wrapper that runs it ("docker exec -i db psql < dump.sql").
  const input = stdinOf(seg, prevSeg) || ctx.stdin || null;

  const nested = depth < MAX_DEPTH ? nestedCommand(u) : null;
  if (nested) {
    const expanding = new Set(seg.words.filter((w) => w.expands).map((w) => w.value));
    const innerCtx = Object.assign({}, ctx, { stdin: input });
    const inner = nested.argv
      ? classifySegment({ words: nested.argv.map((v) => ({ value: v, expands: expanding.has(v) })), sep: null, redirs: [], heredoc: null, herestring: null }, null, innerCtx, depth + 1)
      : classifyText(nested.text, { shell: nested.shell, mode, stdin: input }, depth + 1);
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
    const r = classifySqlClient(cmd, args, seg, input);
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
  sqlWriteReason,
};
