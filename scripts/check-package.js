#!/usr/bin/env node

// Consistency check for the everything-backend package.
// Run with `npm run check` (also runs on `prepublishOnly`). Exits non-zero on any error.
//
// Checks:
// - package.json bin/files entries exist
// - every skill folder has SKILL.md with valid Claude-compatible frontmatter
//   (name = folder, ^[a-z0-9-]{1,64}$; description 1..1024 chars, no < or >;
//   only name/description keys -> warning otherwise)
// - SKILL.md size: > 300 lines warning, > 500 lines error
// - references/<file> mentioned in a SKILL.md exist, and every file in
//   <skill>/references/ is mentioned in that SKILL.md
// - _shared/<path> mentions (including subpaths) exist
// - markdown code fences are balanced in every .md under .agents/skills
// - README.md lists every skill; the orchestrator references every skill
// - .claude-plugin/plugin.json and marketplace.json parse; plugin version = package version
// - hooks/hooks.json parses and every script it points to exists

const fs = require("node:fs");
const path = require("node:path");

const repoRoot = path.resolve(__dirname, "..");
const skillsRoot = path.join(repoRoot, ".agents", "skills");
const sharedDirName = "_shared";
const orchestratorName = "backend-orchestrator";
const maxDescriptionLength = 1024;
const skillNamePattern = /^[a-z0-9-]{1,64}$/;
const allowedFrontmatterKeys = new Set(["name", "description"]);
const skillLineWarn = 300;
const skillLineError = 500;

const errors = [];
const warnings = [];

function rel(targetPath) {
  return path.relative(repoRoot, targetPath).split(path.sep).join("/");
}

function readText(filePath) {
  return fs.readFileSync(filePath, "utf8").replace(/\r\n/g, "\n");
}

function readJson(filePath, label) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    errors.push(`${label}: cannot be read or parsed (${error.message})`);
    return null;
  }
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

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
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
  const keys = [];
  const body = lines.slice(1, end);
  for (let index = 0; index < body.length; index += 1) {
    const match = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(body[index]);
    if (!match) {
      continue;
    }
    const key = match[1];
    const rawValue = match[2];
    keys.push(key);
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
  return { fields, keys };
}

function checkPackageJson() {
  const pkg = readJson(path.join(repoRoot, "package.json"), "package.json");
  if (!pkg) return null;

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

  // npm scripts of the form "node ./scripts/x.js" must point at existing files.
  for (const [scriptName, command] of Object.entries(pkg.scripts || {})) {
    for (const match of String(command).matchAll(/\bnode\s+(\.?\/?[A-Za-z0-9_./-]+\.(?:js|cjs|mjs))/g)) {
      if (!fs.existsSync(path.join(repoRoot, match[1]))) {
        errors.push(`package.json: script "${scriptName}" runs missing file ${match[1]}`);
      }
    }
  }
  return pkg;
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

    if (!skillNamePattern.test(name)) {
      errors.push(`${rel(path.join(skillsRoot, name))}: folder name must match ${skillNamePattern}`);
    }

    const lineCount = text.replace(/\n$/, "").split("\n").length;
    if (lineCount > skillLineError) {
      errors.push(`${rel(skillFile)}: ${lineCount} lines (max ${skillLineError}); move detail into references/`);
    } else if (lineCount > skillLineWarn) {
      warnings.push(`${rel(skillFile)}: ${lineCount} lines (target <= ${skillLineWarn}); move detail into references/`);
    }

    const parsed = parseFrontmatter(text);
    if (!parsed) {
      errors.push(`${rel(skillFile)}: missing or unterminated --- frontmatter block`);
      continue;
    }
    const { fields, keys } = parsed;
    if (fields.name !== name) {
      errors.push(`${rel(skillFile)}: frontmatter name "${fields.name || ""}" does not match folder name "${name}"`);
    }
    if (fields.name && !skillNamePattern.test(fields.name)) {
      errors.push(`${rel(skillFile)}: frontmatter name "${fields.name}" must match ${skillNamePattern}`);
    }
    const extraKeys = keys.filter((key) => !allowedFrontmatterKeys.has(key));
    if (extraKeys.length > 0) {
      warnings.push(`${rel(skillFile)}: frontmatter has extra key(s) ${extraKeys.join(", ")}; only name and description are portable`);
    }
    const description = fields.description || "";
    if (!description.trim()) {
      errors.push(`${rel(skillFile)}: frontmatter description is empty`);
    } else {
      if (description.length > maxDescriptionLength) {
        errors.push(
          `${rel(skillFile)}: frontmatter description is ${description.length} characters (max ${maxDescriptionLength})`
        );
      }
      if (/[<>]/.test(description)) {
        errors.push(`${rel(skillFile)}: frontmatter description must not contain < or >`);
      }
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

// references/<file> links: every mention resolves, every file is mentioned.
function checkReferences(skillNames, skillTexts) {
  const known = new Set(skillNames);
  const pattern = /(?:([a-z0-9-]+)\/)?references\/([A-Za-z0-9_.\/-]*[A-Za-z0-9_-]\.[A-Za-z0-9]+)/g;
  for (const [name, text] of Object.entries(skillTexts)) {
    const mentioned = new Set();
    const missing = new Set();
    for (const match of text.matchAll(pattern)) {
      const owner = match[1] && known.has(match[1]) ? match[1] : name;
      const file = match[2];
      if (owner === name) mentioned.add(file);
      if (!fs.existsSync(path.join(skillsRoot, owner, "references", file))) {
        missing.add(owner === name ? `references/${file}` : `${owner}/references/${file}`);
      }
    }
    for (const file of missing) {
      errors.push(`${name}/SKILL.md: mentions missing file ${file}`);
    }

    const refDir = path.join(skillsRoot, name, "references");
    for (const file of walkFiles(refDir)) {
      const relative = path.relative(refDir, file).split(path.sep).join("/");
      if (!mentioned.has(relative)) {
        errors.push(`${name}/SKILL.md: does not mention references/${relative} (add a "Read when ..." line)`);
      }
    }
  }
}

// _shared/<path> mentions (SKILL.md and references files) must exist.
function checkSharedReferences(skillNames) {
  const sharedRoot = path.join(skillsRoot, sharedDirName);
  const pattern = /_shared\/((?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]*[A-Za-z0-9_-]\.(?:md|js|json|cjs|mjs))/g;
  for (const name of skillNames) {
    const skillDir = path.join(skillsRoot, name);
    const files = [path.join(skillDir, "SKILL.md"), ...walkFiles(path.join(skillDir, "references"))].filter(
      (file) => file.endsWith(".md") && fs.existsSync(file)
    );
    for (const file of files) {
      const missing = new Set();
      for (const match of readText(file).matchAll(pattern)) {
        if (!fs.existsSync(path.join(sharedRoot, match[1]))) {
          missing.add(match[1]);
        }
      }
      for (const shared of missing) {
        errors.push(`${rel(file)}: references missing shared file _shared/${shared}`);
      }
    }
  }
}

// Every opening ``` or ~~~ fence needs a matching closing fence.
function checkFences() {
  for (const file of walkFiles(skillsRoot).filter((f) => f.endsWith(".md"))) {
    const lines = readText(file).split("\n");
    let open = null;
    lines.forEach((line, index) => {
      const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(line);
      if (!match) return;
      const marker = match[1];
      const rest = match[2];
      if (open === null) {
        if (marker[0] === "`" && rest.includes("`")) return; // inline code, not a fence
        open = { char: marker[0], length: marker.length, line: index + 1 };
      } else if (marker[0] === open.char && marker.length >= open.length && rest.trim() === "") {
        open = null;
      }
    });
    if (open !== null) {
      errors.push(`${rel(file)}: code fence opened at line ${open.line} is never closed`);
    }
  }
}

function checkClaudePlugin(pkg) {
  const pluginDir = path.join(repoRoot, ".claude-plugin");
  const pluginPath = path.join(pluginDir, "plugin.json");
  const marketplacePath = path.join(pluginDir, "marketplace.json");

  if (!fs.existsSync(pluginPath)) {
    errors.push(".claude-plugin/plugin.json: not found");
  } else {
    const plugin = readJson(pluginPath, ".claude-plugin/plugin.json");
    if (plugin) {
      if (!plugin.name || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(plugin.name)) {
        errors.push(".claude-plugin/plugin.json: name must be kebab-case");
      } else if (/^(claude|anthropic)-/.test(plugin.name)) {
        errors.push(".claude-plugin/plugin.json: name must not start with claude- or anthropic-");
      }
      if (pkg && plugin.version !== pkg.version) {
        errors.push(
          `.claude-plugin/plugin.json: version "${plugin.version}" does not match package.json version "${pkg.version}"`
        );
      }
      const skillPaths = plugin.skills === undefined ? [] : [].concat(plugin.skills);
      for (const skillPath of skillPaths) {
        if (typeof skillPath !== "string" || !skillPath.startsWith("./")) {
          errors.push(`.claude-plugin/plugin.json: skills path "${skillPath}" must start with ./`);
        } else if (!fs.existsSync(path.join(repoRoot, skillPath))) {
          errors.push(`.claude-plugin/plugin.json: skills path "${skillPath}" does not exist`);
        }
      }
    }
  }

  if (!fs.existsSync(marketplacePath)) {
    errors.push(".claude-plugin/marketplace.json: not found");
  } else {
    const marketplace = readJson(marketplacePath, ".claude-plugin/marketplace.json");
    if (marketplace && (!Array.isArray(marketplace.plugins) || marketplace.plugins.length === 0)) {
      errors.push(".claude-plugin/marketplace.json: plugins must be a non-empty array");
    } else if (marketplace) {
      if (!marketplace.name || !marketplace.owner || !marketplace.owner.name) {
        errors.push(".claude-plugin/marketplace.json: name and owner.name are required");
      }
      for (const entry of marketplace.plugins) {
        if (!entry || !entry.name || entry.source === undefined) {
          errors.push(".claude-plugin/marketplace.json: every plugin entry needs name and source");
          continue;
        }
        if (/^(claude|anthropic)-/.test(entry.name)) {
          errors.push(`.claude-plugin/marketplace.json: plugin name "${entry.name}" must not start with claude- or anthropic-`);
        }
        if (typeof entry.source === "string") {
          if (!entry.source.startsWith("./")) {
            errors.push(`.claude-plugin/marketplace.json: relative source "${entry.source}" must start with ./`);
          } else if (!fs.existsSync(path.join(repoRoot, entry.source, ".claude-plugin", "plugin.json"))) {
            errors.push(`.claude-plugin/marketplace.json: source "${entry.source}" has no .claude-plugin/plugin.json`);
          }
        }
      }
    }
  }
}

function checkHooks() {
  const hooksPath = path.join(repoRoot, "hooks", "hooks.json");
  if (!fs.existsSync(hooksPath)) {
    errors.push("hooks/hooks.json: not found");
    return;
  }
  const config = readJson(hooksPath, "hooks/hooks.json");
  if (!config) return;
  if (!config.hooks || typeof config.hooks !== "object") {
    errors.push('hooks/hooks.json: missing top-level "hooks" object');
    return;
  }
  const scripts = new Set();
  for (const groups of Object.values(config.hooks)) {
    for (const group of Array.isArray(groups) ? groups : []) {
      for (const hook of Array.isArray(group.hooks) ? group.hooks : []) {
        const parts = [hook.command, ...(Array.isArray(hook.args) ? hook.args : [])].filter(
          (part) => typeof part === "string"
        );
        for (const part of parts) {
          for (const match of part.matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^\s"']+)/g)) {
            scripts.add(match[1]);
          }
        }
      }
    }
  }
  if (scripts.size === 0) {
    warnings.push("hooks/hooks.json: no ${CLAUDE_PLUGIN_ROOT} script paths found to verify");
  }
  for (const script of scripts) {
    if (!fs.existsSync(path.join(repoRoot, script))) {
      errors.push(`hooks/hooks.json: points to missing script ${script}`);
    }
  }
}

// The Claude.ai bundle must contain and route every skill; buildBundle() throws otherwise.
function checkClaudeBundle() {
  const entryPath = path.join(repoRoot, "packaging", "claude-ai", "SKILL.md");
  if (!fs.existsSync(entryPath)) {
    errors.push("packaging/claude-ai/SKILL.md: missing (Claude.ai bundle entry point)");
    return;
  }
  const parsed = parseFrontmatter(readText(entryPath));
  const fm = parsed && parsed.fields;
  if (!fm || fm.name !== "everything-backend") errors.push('packaging/claude-ai/SKILL.md: frontmatter name must be "everything-backend"');
  const description = (fm && fm.description) || "";
  if (!description || description.length > maxDescriptionLength || /[<>]/.test(description)) {
    errors.push("packaging/claude-ai/SKILL.md: description must be 1-" + maxDescriptionLength + " characters without < or >");
  }
  try {
    const { buildBundle } = require("./build-claude-skills.js");
    const { entries, skills } = buildBundle();
    const names = new Set(entries.map((e) => e.name));
    for (const skill of skills) {
      if (!names.has("everything-backend/skills/" + skill + "/SKILL.md")) errors.push("Claude.ai bundle: missing " + skill);
    }
  } catch (error) {
    errors.push("Claude.ai bundle: " + error.message);
  }
}

function main() {
  const pkg = checkPackageJson();
  const skillNames = listSkillDirectories();
  const skillTexts = checkSkills(skillNames);
  checkListings(skillNames, skillTexts);
  checkReferences(skillNames, skillTexts);
  checkSharedReferences(Object.keys(skillTexts));
  checkFences();
  checkClaudePlugin(pkg);
  checkHooks();
  checkClaudeBundle();

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
