#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const args = process.argv.slice(2);

const readline = require("node:readline");

const GLOBAL_TARGETS = [
  {
    id: "claude",
    host: "claude",
    name: "Claude Code (~/.claude/skills)",
    target: path.join(os.homedir(), ".claude", "skills"),
    writePluginJson: false,
    skillsSubdirectory: false,
    claudeCode: true,
  },
  {
    id: "gemini",
    host: "antigravity",
    name: "Antigravity (Gemini IDE)",
    target: path.join(os.homedir(), ".gemini", "config", "plugins", "everything-backend-plugin"),
    writePluginJson: true,
    skillsSubdirectory: true,
  },
  {
    id: "cursor",
    host: "cursor",
    name: "Cursor",
    target: path.join(os.homedir(), ".cursor", "skills"),
    writePluginJson: false,
    skillsSubdirectory: false,
  },
  {
    id: "opencode",
    host: "opencode",
    name: "Opencode / generic global skills",
    target: path.join(os.homedir(), ".agents", "skills"),
    writePluginJson: false,
    skillsSubdirectory: false,
  },
];

const HOST_NAMES = GLOBAL_TARGETS.map((entry) => entry.host);

const PROJECT_LAYOUTS = [
  {
    name: ".agents/skills (OpenCode, Cursor, generic)",
    segments: [".agents", "skills"],
    claudeCode: false,
  },
  {
    name: ".claude/skills (Claude Code)",
    segments: [".claude", "skills"],
    claudeCode: true,
  },
];

const CLAUDE_PLUGIN_COMMANDS = [
  "/plugin marketplace add codeworksID/everything-backend",
  "/plugin install everything-backend@codeworks",
];

function printClaudeCodeNote() {
  writeLog("");
  writeLog("Note for Claude Code: the guard hook (asks before destructive git, migration,");
  writeLog("deploy and secret-file operations) only comes with the plugin install.");
  writeLog("To get it, run these inside Claude Code:");
  for (const command of CLAUDE_PLUGIN_COMMANDS) {
    writeLog(`  ${command}`);
  }
  writeLog("If you install the plugin, you can remove the copied skills to avoid duplicates.");
}

function printHelp() {
  console.log(`everything-backend installer

Usage:
  everything-backend [--dry-run] [--force] [--host <name>] [--target <path>]
  node scripts/install.js [--dry-run] [--force] [--host <name>] [--target <path>]

Options:
  --dry-run        Show planned file operations without writing
  --force          Overwrite an already-installed skill directory
  --host <name>    Global install for one host, no prompts: ${HOST_NAMES.join(" | ")}
  --target <path>  Custom destination for installed skills (bypasses interactive prompts;
                   overrides the --host destination when both are given)
  --version, -v    Print version and exit
  --update         Print self-update instructions and exit
  --help           Show this message

Claude Code plugin (skills plus the guard hook), run inside Claude Code:
  ${CLAUDE_PLUGIN_COMMANDS.join("\n  ")}

Claude.ai: in a clone of the repo run "npm run build:claude", then upload each
dist/claude-skills/<skill>.zip under Settings > Capabilities > Skills.
`);
}

function getPackageVersion() {
  try {
    const pkg = require(path.join(__dirname, "..", "package.json"));
    return pkg.version;
  } catch (err) {
    return "unknown";
  }
}

function printVersion() {
  console.log(`everything-backend v${getPackageVersion()}`);
}

function printUpdateInstructions() {
  console.log(`everything-backend v${getPackageVersion()}

To update everything-backend to the latest version:

  npx -y everything-backend@latest

That will re-run the installer with the newest published version.
If you installed it globally, you can also run:

  npm update -g everything-backend

Then re-run this installer to refresh your skills:

  npx everything-backend --force --target <path>
`);
}

let ttyInput = null;
let ttyOutput = null;
let customStreams = false;
let rl = null;

function initTTY() {
  if (!process.stdin.isTTY) {
    try {
      const fs = require("node:fs");
      if (process.platform === "win32") {
        ttyInput = fs.createReadStream("\\\\.\\CON");
        ttyOutput = fs.createWriteStream("\\\\.\\CON");
      } else {
        ttyInput = fs.createReadStream("/dev/tty");
        ttyOutput = fs.createWriteStream("/dev/tty");
      }
      customStreams = true;
    } catch (err) {
      ttyInput = process.stdin;
      ttyOutput = process.stdout;
      customStreams = false;
    }
  } else {
    ttyInput = process.stdin;
    ttyOutput = process.stdout;
  }
}

function createReadline() {
  rl = readline.createInterface({
    input: ttyInput || process.stdin,
    output: ttyOutput || process.stdout,
  });
}

function cleanTTY() {
  if (rl) {
    rl.close();
    rl = null;
  }
  if (customStreams) {
    if (ttyInput) ttyInput.destroy();
    if (ttyOutput) ttyOutput.destroy();
  }
}

function writeLog(message) {
  if (ttyOutput && !ttyOutput.destroyed) {
    ttyOutput.write(message + "\n");
  } else {
    console.log(message);
  }
}

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, (answer) => {
      resolve(answer.trim());
    });
  });
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    target: null,
    explicitTarget: false,
    mode: "project", // default mode
    writePluginJson: false,
    skillsSubdirectory: false,
    host: null,
    claudeCode: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--version" || arg === "-v") {
      options.version = true;
      continue;
    }

    if (arg === "--update") {
      options.update = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--target") {
      const value = argv[index + 1];
      if (!value) {
        throw new Error("Missing value for --target");
      }
      options.target = path.resolve(value);
      options.explicitTarget = true;
      index += 1;
      continue;
    }

    if (arg === "--host") {
      const value = (argv[index + 1] || "").toLowerCase();
      if (!value) {
        throw new Error(`Missing value for --host (one of: ${HOST_NAMES.join(", ")})`);
      }
      if (!HOST_NAMES.includes(value)) {
        throw new Error(`Unknown host "${value}" (one of: ${HOST_NAMES.join(", ")})`);
      }
      options.host = value;
      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.host) {
    const selected = GLOBAL_TARGETS.find((entry) => entry.host === options.host);
    options.mode = "global";
    if (!options.explicitTarget) {
      options.target = selected.target;
    }
    options.writePluginJson = selected.writePluginJson;
    options.skillsSubdirectory = selected.skillsSubdirectory;
    options.claudeCode = Boolean(selected.claudeCode);
  }

  return options;
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

async function realOrResolved(p) {
  try {
    return await fs.realpath(p);
  } catch {
    return path.resolve(p);
  }
}

// True when child is parent or lies inside it.
function isInsideOrEqual(child, parent) {
  const norm = (p) => {
    const r = path.resolve(p);
    return process.platform === "win32" ? r.toLowerCase() : r;
  };
  const rel = path.relative(norm(parent), norm(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

async function copyDirectory(source, destination) {
  await fs.cp(source, destination, { recursive: true });
}

async function writePluginJson(targetDir) {
  const pluginJsonPath = path.join(targetDir, "plugin.json");
  const content = {
    name: "everything-backend-plugin",
    version: getPackageVersion(),
    description: "Reusable backend skills for architecture, database design, API design, testing, and deployment."
  };
  await fs.writeFile(pluginJsonPath, JSON.stringify(content, null, 2), "utf8");
}

async function main() {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }

  if (options.version) {
    printVersion();
    return;
  }

  if (options.update) {
    printUpdateInstructions();
    return;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const sourceRoot = path.join(repoRoot, ".agents", "skills");

  if (!(await pathExists(sourceRoot))) {
    throw new Error(`Skills source directory not found: ${sourceRoot}`);
  }

  try {
    // Interactive flow if neither --target nor --host is provided
    if (!options.explicitTarget && !options.host) {
      // If running as a postinstall script during npm i, never prompt: print instructions and exit.
      // Prompting during npm i is broken due to npm's output suppression and loading spinner.
      // Explicit CLI runs (node scripts/install.js, npx everything-backend) always proceed.
      if (process.env.npm_lifecycle_event === "postinstall") {
        // `npm install` inside the package's own repo: there is nothing to install.
        const isLocalDev = !__dirname.includes("node_modules");
        if (isLocalDev) {
          console.log("[everything-backend] Local development environment detected. Skipping postinstall.");
          return;
        }
        console.log("\n[everything-backend] Package installed successfully!");
        console.log("[everything-backend] To finish setup and copy your skills (Global or Per-project), please run:");
        console.log("  npx everything-backend\n");
        return;
      }

      // Initialize TTY inputs/outputs for interactive prompts
      initTTY();
      createReadline();

      writeLog("How would you like to install everything-backend skills?");
      writeLog("1) Global (install as a global IDE plugin)");
      writeLog("2) Per-project (install to a specific project workspace)");

      let choice = "";
      let choiceAttempts = 0;
      while (choice !== "1" && choice !== "2" && choiceAttempts < 5) {
        choice = await askQuestion("Choose an option [1 or 2]: ");
        choiceAttempts++;
      }

      if (choiceAttempts >= 5 && choice !== "1" && choice !== "2") {
        writeLog("Non-interactive environment detected or prompt timed out. Skipping installation.");
        return;
      }

      if (choice === "1") {
        options.mode = "global";

        writeLog("Which IDE / app would you like to install the skills for?");
        GLOBAL_TARGETS.forEach((appTarget, index) => {
          writeLog(`${index + 1}) ${appTarget.name}`);
        });

        const appChoiceMax = GLOBAL_TARGETS.length;
        const validAppChoices = GLOBAL_TARGETS.map((_, index) => String(index + 1));
        let appChoice = "";
        let appAttempts = 0;
        while (!validAppChoices.includes(appChoice) && appAttempts < 5) {
          appChoice = await askQuestion(`Choose an option [1-${appChoiceMax}]: `);
          appAttempts++;
        }

        if (appAttempts >= 5 && !validAppChoices.includes(appChoice)) {
          writeLog("Non-interactive environment detected or prompt timed out. Skipping installation.");
          return;
        }

        const selectedApp = GLOBAL_TARGETS[Number(appChoice) - 1];
        options.target = selectedApp.target;
        options.writePluginJson = selectedApp.writePluginJson;
        options.skillsSubdirectory = selectedApp.skillsSubdirectory;
        options.claudeCode = Boolean(selectedApp.claudeCode);
      } else {
        options.mode = "project";
        let projectPath = "";
        let pathAttempts = 0;
        while (!projectPath && pathAttempts < 5) {
          const inputPath = await askQuestion("Enter the path to your project directory: ");
          pathAttempts++;
          if (!inputPath) {
            writeLog("Project path cannot be empty.");
            continue;
          }
          const resolvedPath = path.resolve(inputPath);
          if (!(await pathExists(resolvedPath))) {
            writeLog(`Error: The path "${resolvedPath}" does not exist. Please enter a valid directory.`);
            continue;
          }
          projectPath = resolvedPath;
        }

        if (pathAttempts >= 5 && !projectPath) {
          writeLog("Non-interactive environment detected or prompt timed out. Skipping installation.");
          return;
        }

        writeLog("Which skills folder layout should the project use?");
        PROJECT_LAYOUTS.forEach((layout, index) => {
          writeLog(`${index + 1}) ${layout.name}`);
        });
        const validLayoutChoices = PROJECT_LAYOUTS.map((_, index) => String(index + 1));
        let layoutChoice = "";
        let layoutAttempts = 0;
        while (!validLayoutChoices.includes(layoutChoice) && layoutAttempts < 5) {
          layoutChoice = await askQuestion(`Choose an option [1-${PROJECT_LAYOUTS.length}]: `);
          layoutAttempts++;
        }

        if (layoutAttempts >= 5 && !validLayoutChoices.includes(layoutChoice)) {
          writeLog("Non-interactive environment detected or prompt timed out. Skipping installation.");
          return;
        }

        const layout = PROJECT_LAYOUTS[Number(layoutChoice) - 1];
        options.target = path.join(projectPath, ...layout.segments);
        options.claudeCode = layout.claudeCode;
      }
    }

    const dirEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
    const skillDirectories = dirEntries.filter((entry) => entry.isDirectory());

    if (skillDirectories.length === 0) {
      throw new Error(`No skills found in ${sourceRoot}`);
    }

    if (options.dryRun) {
      writeLog(`[dry-run] Skills source: ${sourceRoot}`);
      writeLog(`[dry-run] Install target: ${options.target}`);
      if (options.writePluginJson) {
        writeLog(`[dry-run] Create plugin.json at: ${path.join(options.target, "plugin.json")}`);
      }
    } else {
      await fs.mkdir(options.target, { recursive: true });
      if (options.writePluginJson) {
        await writePluginJson(options.target);
        writeLog(`Created plugin.json at: ${path.join(options.target, "plugin.json")}`);
      }
    }

    const skillsDestTarget = options.skillsSubdirectory
      ? path.join(options.target, "skills")
      : options.target;

    // --force deletes each destination skill directory before copying. If the
    // destination is the source (or inside it), that would delete the pack itself.
    const realSource = await realOrResolved(sourceRoot);
    if (isInsideOrEqual(await realOrResolved(skillsDestTarget), realSource)) {
      throw new Error(`Install target ${skillsDestTarget} is inside the skills source ${sourceRoot}; choose another --target`);
    }

    if (!options.dryRun) {
      await fs.mkdir(skillsDestTarget, { recursive: true });
    }

    for (const skillDir of skillDirectories) {
      const sourcePath = path.join(sourceRoot, skillDir.name);
      const destinationPath = path.join(skillsDestTarget, skillDir.name);
      const destinationExists = await pathExists(destinationPath);

      if (destinationExists && !options.force) {
        writeLog(`Skipping ${skillDir.name} (already exists). Use --force to overwrite.`);
        continue;
      }

      if (options.dryRun) {
        writeLog(`[dry-run] ${destinationExists ? "overwrite" : "install"} ${skillDir.name}`);
        continue;
      }

      if (destinationExists) {
        if (isInsideOrEqual(realSource, await realOrResolved(destinationPath))) {
          throw new Error(`Refusing to replace ${destinationPath}: it contains the skills source ${sourceRoot}`);
        }
        await fs.rm(destinationPath, { recursive: true, force: true });
      }

      await copyDirectory(sourcePath, destinationPath);
      writeLog(`Installed ${skillDir.name}`);
    }

    writeLog(options.dryRun ? "Dry run complete." : `Install complete. Skills available in ${options.target}`);
    if (options.claudeCode) {
      printClaudeCodeNote();
    }
  } finally {
    cleanTTY();
  }
}

main().catch((error) => {
  writeLog(`Installation failed: ${error.message}`);
  cleanTTY();
  process.exitCode = 1;
});
