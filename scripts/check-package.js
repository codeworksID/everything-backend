#!/usr/bin/env node

// Consistency check for the everything-backend package.
// Run with `npm run check` (also runs on `prepublishOnly`). Exits non-zero on any problem.

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, ".agents", "skills");
const sharedDirName = "_shared";
const orchestratorName = "backend-orchestrator";
const maxDescriptionLength = 1024;

const errors = [];
const warnings = [];

function rel(targetPath) {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function stripQuotes(value) {
  const trimmed = value.trim();
  if (trimmed.length >= 2) {
    const first = trimmed[0];
    const last = trimmed[trimmed.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

// Minimal frontmatter parser: top-level `key: value` pairs, quoted values,
// and `>` / `|` block scalars. Enough for SKILL.md name/description.
function parseFrontmatter(text) {
  const lines = text.split("\n");
  if (lines[0].trim() !== "---") {
    return null;
  }
  const end = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (end === -1) {
    return null;
  }

  const fields = {};
  const body = lines.slice(1, end);
  for (let index = 0; index < body.length; index += 1) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(body[index]);
    if (!match) {
      continue;
    }
    const key = match[1];
    const rawValue = match[2];
    if (/^[>|][+-]?$/.test(rawValue.trim())) {
      const blockLines = [];
      while (index + 1 < body.length && (/^\s+/.test(body[index + 1]) || body[index + 1].trim() === "")) {
        index += 1;
        blockLines.push(body[index].trim());
      }
      const joiner = rawValue.trim().startsWith(">") ? " " : "\n";
      fields[key] = blockLines.join(joiner).trim();
    } else {
      fields[key] = stripQuotes(rawValue);
    }
  }
  return fields;
}

function checkPackageJson() {
  const pkgPath = path.join(repoRoot, "package.json");
  let pkg;
  try {
    pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  } catch (error) {
    errors.push(`package.json: cannot be read or parsed (${error.message})`);
    return;
  }

  const binEntries =
    typeof pkg.bin === "string" ? { [pkg.name]: pkg.bin } : pkg.bin && typeof pkg.bin === "object" ? pkg.bin : {};
  for (const [binName, binPath] of Object.entries(binEntries)) {
    if (!fs.existsSync(path.join(repoRoot, binPath))) {
      errors.push(`package.json: bin "${binName}" points to missing file ${binPath}`);
    }
  }

  for (const entry of Array.isArray(pkg.files) ? pkg.files : []) {
    if (/[*?[\]{}!]/.test(entry)) {
      warnings.push(`package.json: files entry "${entry}" is a glob pattern; not verified`);
      continue;
    }
    if (!fs.existsSync(path.join(repoRoot, entry))) {
      errors.push(`package.json: files entry "${entry}" does not exist`);
    }
  }
}

function listSkillDirectories() {
  if (!fs.existsSync(skillsRoot)) {
    errors.push(`skills directory not found: ${rel(skillsRoot)}`);
    return [];
  }
  return fs
    .readdirSync(skillsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && entry.name !== sharedDirName)
    .map((entry) => entry.name)
    .sort();
}

function checkSkills(skillNames) {
  const skillTexts = {};
  for (const name of skillNames) {
    const skillFile = path.join(skillsRoot, name, "SKILL.md");
    if (!fs.existsSync(skillFile)) {
      errors.push(`${rel(path.join(skillsRoot, name))}: missing SKILL.md`);
      continue;
    }
    const text = readText(skillFile);
    skillTexts[name] = text;

    const frontmatter = parseFrontmatter(text);
    if (!frontmatter) {
      errors.push(`${rel(skillFile)}: missing or unterminated --- frontmatter block`);
      continue;
    }
    if (frontmatter.name !== name) {
      errors.push(`${rel(skillFile)}: frontmatter name "${frontmatter.name || ""}" does not match folder name "${name}"`);
    }
    const description = frontmatter.description || "";
    if (!description.trim()) {
      errors.push(`${rel(skillFile)}: frontmatter description is empty`);
    } else if (description.length > maxDescriptionLength) {
      errors.push(
        `${rel(skillFile)}: frontmatter description is ${description.length} characters (max ${maxDescriptionLength})`
      );
    }
  }
  return skillTexts;
}

// True when `name` appears as a whole skill name (not as a prefix of a longer one).
function mentionsSkill(text, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])${escaped}(?![A-Za-z0-9_-])`).test(text);
}

function checkListings(skillNames, skillTexts) {
  const readmePath = path.join(repoRoot, "README.md");
  const readme = fs.existsSync(readmePath) ? readText(readmePath) : null;
  if (readme === null) {
    errors.push("README.md: not found");
  }

  const orchestratorText = skillTexts[orchestratorName];
  if (orchestratorText === undefined) {
    errors.push(`${orchestratorName}: skill not found, cannot check routing coverage`);
  }

  for (const name of skillNames) {
    if (readme !== null && !readme.includes("`" + name + "`")) {
      errors.push(`README.md: skill \`${name}\` is not listed`);
    }
    if (orchestratorText !== undefined && name !== orchestratorName && !mentionsSkill(orchestratorText, name)) {
      errors.push(`${orchestratorName}/SKILL.md: skill \`${name}\` is not referenced`);
    }
  }
}

function checkSharedReferences(skillTexts) {
  const sharedRoot = path.join(skillsRoot, sharedDirName);
  const pattern = /_shared\/([A-Za-z0-9_.-]+\.md)/g;
  for (const [name, text] of Object.entries(skillTexts)) {
    const missing = new Set();
    for (const match of text.matchAll(pattern)) {
      if (!fs.existsSync(path.join(sharedRoot, match[1]))) {
        missing.add(match[1]);
      }
    }
    for (const file of missing) {
      errors.push(`${name}/SKILL.md: references missing shared file _shared/${file}`);
    }
  }
}

function main() {
  checkPackageJson();
  const skillNames = listSkillDirectories();
  const skillTexts = checkSkills(skillNames);
  checkListings(skillNames, skillTexts);
  checkSharedReferences(skillTexts);

  for (const warning of warnings) {
    console.warn(`check-package: warning: ${warning}`);
  }

  if (errors.length > 0) {
    console.error(`check-package: ${errors.length} problem(s) found:`);
    for (const error of errors) {
      console.error(`  - ${error}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`check-package: OK (${skillNames.length} skills checked)`);
}

main();
