#!/usr/bin/env node
"use strict";

// Builds the Claude.ai upload (Settings > Capabilities > Skills) as ONE skill that
// contains every sub-skill, so the pack can't be installed partially.
//
//   node scripts/build-claude-skills.js [--out <dir>]
//
// Output: dist/claude/everything-backend.zip with
//   everything-backend/SKILL.md          entry point (packaging/claude-ai/SKILL.md): verify, then route
//   everything-backend/MANIFEST.json     version, sub-skill list, SHA-256 of every file
//   everything-backend/verify.js|.py     completeness check the entry point runs first
//   everything-backend/skills/<skill>/   every sub-skill
//   everything-backend/skills/_shared/   shared docs (sub-skills find it as ../_shared/)
// The build fails if any skill folder lacks SKILL.md or the entry point doesn't route it.
//
// Zero dependencies: a minimal ZIP writer (deflate via node:zlib, CRC32, local
// headers, central directory, end-of-central-directory record).

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");
const crypto = require("node:crypto");

const repoRoot = path.resolve(__dirname, "..");
const defaultSkillsRoot = path.join(repoRoot, ".agents", "skills");
const sharedName = "_shared";
const bundleName = "everything-backend";
const defaultPackagingDir = path.join(repoRoot, "packaging", "claude-ai");
const IGNORED = new Set([".DS_Store", "Thumbs.db", "desktop.ini"]);

function display(p) {
  const r = path.relative(repoRoot, p);
  return (r && !r.startsWith("..") && !path.isAbsolute(r) ? r : p).split(path.sep).join("/");
}

// ---------- CRC32 ----------
const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i += 1) crc = CRC_TABLE[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

// ---------- ZIP writer ----------
function dosDateTime(date) {
  const year = Math.max(1980, date.getFullYear());
  const time = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const day = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { time, day };
}

/**
 * @param {{name: string, data: Buffer, mtime?: Date}[]} entries  name uses forward slashes
 * @returns {Buffer}
 */
function createZip(entries) {
  const locals = [];
  const centrals = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBuf = Buffer.from(entry.name, "utf8");
    const raw = entry.data;
    const deflated = zlib.deflateRawSync(raw, { level: 9 });
    const useDeflate = deflated.length < raw.length;
    const body = useDeflate ? deflated : raw;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(raw);
    const { time, day } = dosDateTime(entry.mtime || new Date());
    const flags = 0x0800; // UTF-8 names

    if (raw.length >= 0xffffffff || offset >= 0xffffffff) {
      throw new Error(`File too large for this ZIP writer (no ZIP64): ${entry.name}`);
    }

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(day, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    locals.push(local, nameBuf, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // made by: UNIX, spec 2.0
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(day, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30); // extra
    central.writeUInt16LE(0, 32); // comment
    central.writeUInt16LE(0, 34); // disk number
    central.writeUInt16LE(0, 36); // internal attrs
    central.writeUInt32LE((0o100644 << 16) >>> 0, 38); // external attrs: regular file 0644
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }

  const centralBuf = Buffer.concat(centrals);
  if (entries.length > 0xffff) throw new Error("Too many entries for this ZIP writer (no ZIP64)");
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, centralBuf, eocd]);
}

// ---------- file collection ----------
// Text files go into the zip with LF endings whatever the local checkout did
// (.gitattributes sets eol=lf; this guards core.autocrlf and hand-edited copies).
// verify.js/verify.py hash with CRLF normalized to LF too, so both sides agree.
function normalizeEol(data) {
  if (data.includes(0)) return data; // binary: keep bytes
  return Buffer.from(data.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
}

function sha256(data) {
  return crypto.createHash("sha256").update(normalizeEol(data)).digest("hex");
}

function collectFiles(dir, prefix, skipTopLevel) {
  const out = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (IGNORED.has(entry.name)) continue;
    if (skipTopLevel && skipTopLevel.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    const name = `${prefix}/${entry.name}`;
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, name, null));
    } else if (entry.isFile()) {
      const stat = fs.statSync(full);
      out.push({ name, data: normalizeEol(fs.readFileSync(full)), mtime: stat.mtime });
    }
  }
  return out;
}

function parseArgs(argv) {
  const options = { out: path.join(repoRoot, "dist", "claude") };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--out") {
      if (!argv[i + 1]) throw new Error("Missing value for --out");
      options.out = path.resolve(argv[(i += 1)]);
    } else if (arg === "--skill") {
      throw new Error("--skill is no longer supported: the Claude.ai bundle always contains every skill");
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function listSkills(skillsRoot) {
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== sharedName && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
}

// Claude.ai skill rules for the entry point: name lowercase letters/digits/hyphens,
// at most 64 chars, no reserved words; description 1-1024 chars without angle brackets.
// A "N sub-skills" count in the description must match the skills on disk.
function checkEntryFrontmatter(text, skillCount) {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error("packaging/claude-ai/SKILL.md: missing YAML frontmatter");
  const field = (key) => {
    const m = new RegExp(`^${key}:[ \\t]*(.*)$`, "m").exec(fm[1]);
    return m ? m[1].trim().replace(/^(["'])(.*)\1$/, "$2") : "";
  };
  const name = field("name");
  const description = field("description");
  if (name !== bundleName) throw new Error(`packaging/claude-ai/SKILL.md: name must be "${bundleName}"`);
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(name) || name.length > 64 || /claude|anthropic/.test(name)) {
    throw new Error("packaging/claude-ai/SKILL.md: name must be lowercase-hyphen, <= 64 chars, without claude/anthropic");
  }
  if (!description || description.length > 1024 || /[<>]/.test(description)) {
    throw new Error("packaging/claude-ai/SKILL.md: description must be 1-1024 characters without < or >");
  }
  const count = /(\d+) sub-skills/.exec(description);
  if (count && Number(count[1]) !== skillCount) {
    throw new Error(`packaging/claude-ai/SKILL.md: description says ${count[1]} sub-skills but there are ${skillCount}`);
  }
}

// Builds the bundle entries in memory. Throws if any skill or shared file is missing,
// so a partial bundle can never be produced.
// options.skillsRoot / options.packagingDir override the repo folders (used by tests).
function buildBundle(options = {}) {
  const skillsRoot = options.skillsRoot || defaultSkillsRoot;
  const packagingDir = options.packagingDir || defaultPackagingDir;
  const sharedDir = path.join(skillsRoot, sharedName);
  if (!fs.existsSync(sharedDir)) throw new Error(`Shared docs not found: ${sharedDir}`);
  for (const f of ["SKILL.md", "verify.js", "verify.py"]) {
    if (!fs.existsSync(path.join(packagingDir, f))) throw new Error(`Bundle template missing: packaging/claude-ai/${f}`);
  }
  const skills = listSkills(skillsRoot);
  const missing = skills.filter((s) => !fs.existsSync(path.join(skillsRoot, s, "SKILL.md")));
  if (missing.length > 0) throw new Error(`Skill folder(s) without SKILL.md: ${missing.join(", ")}`);

  const template = normalizeEol(fs.readFileSync(path.join(packagingDir, "SKILL.md"))).toString("utf8");
  // The routing table (rows "| `backend-x` | ... |") must name exactly the skills on disk.
  const routed = [...template.matchAll(/^\|\s*`([a-z0-9-]+)`\s*\|/gm)].map((m) => m[1]);
  const unrouted = skills.filter((s) => !routed.includes(s));
  if (unrouted.length > 0) throw new Error(`packaging/claude-ai/SKILL.md routing table is missing skill(s): ${unrouted.join(", ")}`);
  const ghosts = routed.filter((s) => !skills.includes(s));
  if (ghosts.length > 0) throw new Error(`packaging/claude-ai/SKILL.md routes skill(s) that do not exist: ${ghosts.join(", ")}`);
  checkEntryFrontmatter(template, skills.length);

  const version = require(path.join(repoRoot, "package.json")).version;
  const entry = template
    .replace(/\{\{VERSION\}\}/g, version)
    .replace(/\{\{SKILL_COUNT\}\}/g, String(skills.length))
    .replace(/\{\{SKILL_LIST\}\}/g, skills.map((s) => `   - \`${s}\``).join("\n"));
  if (/\{\{\w+\}\}/.test(entry)) throw new Error("packaging/claude-ai/SKILL.md has an unknown {{placeholder}}");

  const now = new Date();
  const content = [];
  for (const skill of skills) {
    // A skill's own _shared (if any) is replaced by the single canonical copy.
    content.push(...collectFiles(path.join(skillsRoot, skill), `${bundleName}/skills/${skill}`, new Set([sharedName])));
  }
  content.push(...collectFiles(sharedDir, `${bundleName}/skills/${sharedName}`, null));
  content.push({ name: `${bundleName}/verify.js`, data: normalizeEol(fs.readFileSync(path.join(packagingDir, "verify.js"))), mtime: now });
  content.push({ name: `${bundleName}/verify.py`, data: normalizeEol(fs.readFileSync(path.join(packagingDir, "verify.py"))), mtime: now });
  for (const skill of skills) {
    if (!content.some((e) => e.name === `${bundleName}/skills/${skill}/SKILL.md`)) throw new Error(`Bundle is missing skills/${skill}/SKILL.md`);
  }

  const files = {};
  for (const e of content) files[e.name.slice(bundleName.length + 1)] = sha256(e.data);
  const manifest = { name: bundleName, version, skills, files };
  const entries = [
    { name: `${bundleName}/SKILL.md`, data: Buffer.from(entry, "utf8"), mtime: now },
    { name: `${bundleName}/MANIFEST.json`, data: Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8"), mtime: now },
    ...content,
  ];
  // SKILL.md is listed in the manifest too, so verify.js catches an edited entry point.
  manifest.files["SKILL.md"] = sha256(entries[0].data);
  entries[1].data = Buffer.from(JSON.stringify(manifest, null, 2) + "\n", "utf8");
  return { entries, skills, version };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/build-claude-skills.js [--out <dir>]");
    console.log("Builds dist/claude/everything-backend.zip: one Claude.ai skill containing every sub-skill.");
    return;
  }
  const { entries, skills, version } = buildBundle();
  fs.mkdirSync(options.out, { recursive: true });
  // Remove per-skill zips from older builds so nobody uploads a partial set by mistake.
  const legacy = path.join(repoRoot, "dist", "claude-skills");
  // Only for the default output, so a --out build (tests, CI temp dirs) never touches dist/.
  const defaultOut = path.join(repoRoot, "dist", "claude");
  if (path.resolve(options.out) === defaultOut && fs.existsSync(legacy)) fs.rmSync(legacy, { recursive: true, force: true });
  const zip = createZip(entries);
  const outFile = path.join(options.out, `${bundleName}.zip`);
  fs.writeFileSync(outFile, zip);
  console.log(`built ${display(outFile)} (v${version}, ${skills.length} sub-skills, ${entries.length} files, ${zip.length} bytes)`);
  console.log("Upload it in Claude.ai: Settings > Capabilities > Skills > Upload skill.");
  console.log("Upload only this zip. Remove any older per-skill everything-backend uploads (backend-*) first.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`build-claude-skills: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createZip, crc32, buildBundle, normalizeEol, checkEntryFrontmatter };
