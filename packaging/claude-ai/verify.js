#!/usr/bin/env node
"use strict";

// Verifies that this everything-backend bundle is complete and unmodified.
// Run from anywhere: node verify.js
//   exit 0 = complete (unknown extra files are listed as WARN only)
//   exit 1 = incomplete or changed: do not use the bundle
// Hashes are SHA-256 of the file with CRLF normalized to LF, so a checkout or
// extraction that rewrote line endings still verifies. Must agree with verify.py.

const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const root = __dirname;
const JUNK = new Set([".DS_Store", "Thumbs.db", "desktop.ini", "__pycache__", "__MACOSX"]);
const FIX = "Re-download the full everything-backend.zip and upload it again as ONE skill; do not upload or keep individual sub-skills.";

function fail(message) {
  console.error(`INCOMPLETE: ${message}`);
  console.error(FIX);
  process.exit(1);
}

function hashFile(full) {
  const data = fs.readFileSync(full);
  const lf = Buffer.from(data.toString("latin1").replace(/\r\n/g, "\n"), "latin1");
  return crypto.createHash("sha256").update(lf).digest("hex");
}

function walk(dir, prefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (JUNK.has(entry.name) || entry.name.endsWith(".pyc")) continue;
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel, out);
    else out.push(rel);
  }
  return out;
}

let manifest;
try {
  manifest = JSON.parse(fs.readFileSync(path.join(root, "MANIFEST.json"), "utf8"));
} catch {
  fail("MANIFEST.json is missing or not valid JSON");
}
if (!manifest || !Array.isArray(manifest.skills) || !manifest.files || typeof manifest.files !== "object") {
  fail("MANIFEST.json has no skills list or files map");
}

const problems = [];
for (const skill of manifest.skills) {
  if (!fs.existsSync(path.join(root, "skills", skill, "SKILL.md"))) problems.push(`missing sub-skill: skills/${skill}/SKILL.md`);
}
for (const [file, expected] of Object.entries(manifest.files)) {
  const full = path.join(root, ...file.split("/"));
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
    problems.push(`missing file: ${file}`);
  } else if (hashFile(full) !== expected) {
    problems.push(`changed file: ${file}`);
  }
}

const known = new Set([...Object.keys(manifest.files), "MANIFEST.json"]);
const warnings = [];
const extraSkills = new Set();
for (const rel of walk(root, "", [])) {
  if (known.has(rel)) continue;
  const m = /^skills\/([^/]+)\//.exec(rel);
  if (m && !manifest.skills.includes(m[1]) && m[1] !== "_shared") extraSkills.add(m[1]);
  else warnings.push(`unknown extra file: ${rel}`);
}
for (const s of [...extraSkills].sort().reverse()) warnings.unshift(`unknown sub-skill folder: skills/${s}/ (not part of v${manifest.version}; ignore it)`);

for (const w of warnings.slice(0, 50)) console.error(`WARN: ${w}`);
if (problems.length > 0) {
  console.error(`INCOMPLETE: everything-backend v${manifest.version} bundle has ${problems.length} problem(s):`);
  for (const p of problems.slice(0, 50)) console.error(`  - ${p}`);
  if (problems.length > 50) console.error(`  ... and ${problems.length - 50} more`);
  console.error(FIX);
  process.exit(1);
}
console.log(
  `OK: everything-backend v${manifest.version}, ${manifest.skills.length} sub-skills, ${Object.keys(manifest.files).length} files verified` +
    (warnings.length ? ` (${warnings.length} warning(s))` : "") +
    "."
);
