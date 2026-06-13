#!/usr/bin/env node

const fs = require("node:fs/promises");
const path = require("node:path");
const os = require("node:os");

const args = process.argv.slice(2);

function printHelp() {
  console.log(`everything-backend-skills installer

Usage:
  everything-backend-skills [--dry-run] [--force] [--target <path>]
  node scripts/install.js [--dry-run] [--force] [--target <path>]

Options:
  --dry-run        Show planned file operations without writing
  --force          Overwrite an already-installed skill directory
  --target <path>  Custom destination for installed skills
  --help           Show this message
`);
}

function parseArgs(argv) {
  const options = {
    dryRun: false,
    force: false,
    target: path.join(os.homedir(), ".agents", "skills"),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--help" || arg === "-h") {
      options.help = true;
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

async function main() {
  const options = parseArgs(args);
  if (options.help) {
    printHelp();
    return;
  }

  const repoRoot = path.resolve(__dirname, "..");
  const sourceRoot = path.join(repoRoot, ".agents", "skills");

  if (!(await pathExists(sourceRoot))) {
    throw new Error(`Skills source directory not found: ${sourceRoot}`);
  }

  const dirEntries = await fs.readdir(sourceRoot, { withFileTypes: true });
  const skillDirectories = dirEntries.filter((entry) => entry.isDirectory());

  if (skillDirectories.length === 0) {
    throw new Error(`No skills found in ${sourceRoot}`);
  }

  if (options.dryRun) {
    console.log(`[dry-run] Skills source: ${sourceRoot}`);
    console.log(`[dry-run] Install target: ${options.target}`);
  } else {
    await fs.mkdir(options.target, { recursive: true });
  }

  for (const skillDir of skillDirectories) {
    const sourcePath = path.join(sourceRoot, skillDir.name);
    const destinationPath = path.join(options.target, skillDir.name);
    const destinationExists = await pathExists(destinationPath);

    if (destinationExists && !options.force) {
      console.log(`Skipping ${skillDir.name} (already exists). Use --force to overwrite.`);
      continue;
    }

    if (options.dryRun) {
      console.log(`[dry-run] ${destinationExists ? "overwrite" : "install"} ${skillDir.name}`);
      continue;
    }

    if (destinationExists) {
      await fs.rm(destinationPath, { recursive: true, force: true });
    }

    await copyDirectory(sourcePath, destinationPath);
    console.log(`Installed ${skillDir.name}`);
  }

  console.log(options.dryRun ? "Dry run complete." : `Install complete. Skills available in ${options.target}`);
}

main().catch((error) => {
  console.error(`Installation failed: ${error.message}`);
  process.exitCode = 1;
});
