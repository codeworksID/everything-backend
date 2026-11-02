#!/usr/bin/env node
"use strict";

// Builds one upload-ready zip per skill for Claude.ai (Settings > Capabilities > Skills).
//
//   node scripts/build-claude-skills.js [--out <dir>] [--skill <name>]...
//
// Output: dist/claude-skills/<skill>.zip. Each zip holds the folder <skill>/ with
// the skill's files plus a full copy of _shared at <skill>/_shared/, so every
// upload is self-contained (skills resolve "_shared/" inside their own folder first).
//
// Zero dependencies: a minimal ZIP writer (deflate via node:zlib, CRC32, local
// headers, central directory, end-of-central-directory record).

const fs = require("node:fs");
const path = require("node:path");
const zlib = require("node:zlib");

const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, ".agents", "skills");
const sharedName = "_shared";
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
      out.push({ name, data: fs.readFileSync(full), mtime: stat.mtime });
    }
  }
  return out;
}

function parseArgs(argv) {
  const options = { out: path.join(repoRoot, "dist", "claude-skills"), skills: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
    } else if (arg === "--out") {
      if (!argv[i + 1]) throw new Error("Missing value for --out");
      options.out = path.resolve(argv[(i += 1)]);
    } else if (arg === "--skill") {
      if (!argv[i + 1]) throw new Error("Missing value for --skill");
      options.skills.push(argv[(i += 1)]);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log("Usage: node scripts/build-claude-skills.js [--out <dir>] [--skill <name>]...");
    return;
  }

  const sharedDir = path.join(skillsRoot, sharedName);
  if (!fs.existsSync(sharedDir)) throw new Error(`Shared docs not found: ${sharedDir}`);

  let skills = fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name !== sharedName && !e.name.startsWith("."))
    .map((e) => e.name)
    .sort();
  if (options.skills.length > 0) {
    const unknown = options.skills.filter((s) => !skills.includes(s));
    if (unknown.length > 0) throw new Error(`Unknown skill(s): ${unknown.join(", ")}`);
    skills = skills.filter((s) => options.skills.includes(s));
  }

  fs.mkdirSync(options.out, { recursive: true });
  let built = 0;
  for (const skill of skills) {
    const skillDir = path.join(skillsRoot, skill);
    if (!fs.existsSync(path.join(skillDir, "SKILL.md"))) {
      console.warn(`skip ${skill}: no SKILL.md`);
      continue;
    }
    // A skill's own _shared (if any) is replaced by the canonical copy.
    const files = collectFiles(skillDir, skill, new Set([sharedName]));
    files.push(...collectFiles(sharedDir, `${skill}/${sharedName}`, null));
    const zip = createZip(files);
    const outFile = path.join(options.out, `${skill}.zip`);
    fs.writeFileSync(outFile, zip);
    console.log(`built ${display(outFile)} (${files.length} files, ${zip.length} bytes)`);
    built += 1;
  }
  console.log(`Done: ${built} skill zip(s) in ${display(options.out)}`);
  console.log("Upload each zip in Claude.ai: Settings > Capabilities > Skills > Upload skill.");
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(`build-claude-skills: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = { createZip, crc32 };
