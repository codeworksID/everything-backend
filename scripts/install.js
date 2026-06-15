#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const args = process.argv.slice(2);

const readline = require("node:readline");

const GLOBAL_TARGETS = [
  {
    id: "gemini",
    name: "Gemini IDE",
    target: path.join(os.homedir(), ".gemini", "config", "plugins", "everything-backend-plugin"),
    writePluginJson: true,
    skillsSubdirectory: true,
  },
  {
    id: "cursor",
    name: "Cursor",
    target: path.join(os.homedir(), ".cursor", "skills-cursor"),
    writePluginJson: false,
    skillsSubdirectory: false,
  },
  {
    id: "opencode",
    name: "Opencode / generic global skills",
    target: path.join(os.homedir(), ".agents", "skills"),
    writePluginJson: false,
    skillsSubdirectory: false,
  },
];

function printHelp() {
  console.log(`everything-backend installer

Usage:
  everything-backend [--dry-run] [--force] [--target <path>]
  node scripts/install.js [--dry-run] [--force] [--target <path>]

Options:
  --dry-run        Show planned file operations without writing
  --force          Overwrite an already-installed skill directory
  --target <path>  Custom destination for installed skills (bypasses interactive prompts)
  --version, -v    Print version and exit
  --update         Print self-update instructions and exit
  --help           Show this message
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

    throw new Error(`Unknown argument: ${arg}`);
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

async function copyDirectory(source, destination) {
  await fs.cp(source, destination, { recursive: true });
}

async function writePluginJson(targetDir) {
  const pluginJsonPath = path.join(targetDir, "plugin.json");
  const content = {
    name: "everything-backend-plugin",
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
    // Interactive flow if --target is not provided
    if (!options.explicitTarget) {
      // If running as a postinstall script during npm i, print instruction and exit.
      // Prompting during npm i is broken due to npm's output suppression and loading spinner.
      if (process.env.npm_lifecycle_event === "postinstall") {
        console.log("\n[everything-backend] Package installed successfully!");
        console.log("[everything-backend] To finish setup and copy your skills (Global or Per-project), please run:");
        console.log("  npx everything-backend\n");
        return;
      }

      // Skip interactive installer if running npm install locally in the package's own development directory
      const isLocalDev = !__dirname.includes("node_modules");
      if (isLocalDev && process.cwd() === repoRoot) {
        console.log("Local development environment detected. Skipping installer.");
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

        options.target = path.join(projectPath, ".agents", "skills");
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
        await fs.rm(destinationPath, { recursive: true, force: true });
      }

      await copyDirectory(sourcePath, destinationPath);
      writeLog(`Installed ${skillDir.name}`);
    }

    writeLog(options.dryRun ? "Dry run complete." : `Install complete. Skills available in ${options.target}`);
  } finally {
    cleanTTY();
  }
}

main().catch((error) => {
  writeLog(`Installation failed: ${error.message}`);
  cleanTTY();
  process.exitCode = 1;
});
