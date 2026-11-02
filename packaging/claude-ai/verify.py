#!/usr/bin/env python3
"""Verifies that this everything-backend bundle is complete and unmodified.

Run from anywhere: python3 verify.py
  exit 0 = complete (unknown extra files are listed as WARN only)
  exit 1 = incomplete or changed: do not use the bundle
Hashes are SHA-256 of the file with CRLF normalized to LF, so a checkout or
extraction that rewrote line endings still verifies. Must agree with verify.js.
"""

import hashlib
import json
import os
import re
import sys

root = os.path.dirname(os.path.abspath(__file__))
JUNK = {".DS_Store", "Thumbs.db", "desktop.ini", "__pycache__", "__MACOSX"}
FIX = "Re-download the full everything-backend.zip and upload it again as ONE skill; do not upload or keep individual sub-skills."


def fail(message):
    print(f"INCOMPLETE: {message}", file=sys.stderr)
    print(FIX, file=sys.stderr)
    sys.exit(1)


def hash_file(full):
    with open(full, "rb") as f:
        data = f.read()
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def walk(directory, prefix, out):
    for name in sorted(os.listdir(directory)):
        if name in JUNK or name.endswith(".pyc"):
            continue
        rel = f"{prefix}/{name}" if prefix else name
        full = os.path.join(directory, name)
        if os.path.isdir(full):
            walk(full, rel, out)
        else:
            out.append(rel)
    return out


try:
    with open(os.path.join(root, "MANIFEST.json"), encoding="utf-8") as f:
        manifest = json.load(f)
except (OSError, ValueError):
    fail("MANIFEST.json is missing or not valid JSON")
if not isinstance(manifest, dict) or not isinstance(manifest.get("skills"), list) or not isinstance(manifest.get("files"), dict):
    fail("MANIFEST.json has no skills list or files map")

problems = []
for skill in manifest["skills"]:
    if not os.path.isfile(os.path.join(root, "skills", skill, "SKILL.md")):
        problems.append(f"missing sub-skill: skills/{skill}/SKILL.md")
for name, expected in manifest["files"].items():
    full = os.path.join(root, *name.split("/"))
    if not os.path.isfile(full):
        problems.append(f"missing file: {name}")
    elif hash_file(full) != expected:
        problems.append(f"changed file: {name}")

known = set(manifest["files"]) | {"MANIFEST.json"}
warnings = []
extra_skills = set()
for rel in walk(root, "", []):
    if rel in known:
        continue
    m = re.match(r"^skills/([^/]+)/", rel)
    if m and m.group(1) not in manifest["skills"] and m.group(1) != "_shared":
        extra_skills.add(m.group(1))
    else:
        warnings.append(f"unknown extra file: {rel}")
for s in sorted(extra_skills, reverse=True):
    warnings.insert(0, f"unknown sub-skill folder: skills/{s}/ (not part of v{manifest.get('version')}; ignore it)")

for w in warnings[:50]:
    print(f"WARN: {w}", file=sys.stderr)
if problems:
    print(f"INCOMPLETE: everything-backend v{manifest.get('version')} bundle has {len(problems)} problem(s):", file=sys.stderr)
    for p in problems[:50]:
        print(f"  - {p}", file=sys.stderr)
    if len(problems) > 50:
        print(f"  ... and {len(problems) - 50} more", file=sys.stderr)
    print(FIX, file=sys.stderr)
    sys.exit(1)
suffix = f" ({len(warnings)} warning(s))" if warnings else ""
print(f"OK: everything-backend v{manifest.get('version')}, {len(manifest['skills'])} sub-skills, {len(manifest['files'])} files verified{suffix}.")
