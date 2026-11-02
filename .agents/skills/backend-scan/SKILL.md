---
name: backend-scan
description: "Scans an existing backend codebase read-only and creates or refreshes the project memory files (structure, tech stack, API patterns, database schema, decisions, issues) that the other backend skills rely on. Use it when the user asks to scan, explore or map this backend project, asks what stack, framework or structure the backend uses, or says refresh, sync or update the backend memory. Other backend skills run it first when the memory folder is missing or stale. Supports scope=initial for first discovery and scope=sync for drift detection. It never installs, builds, tests, migrates or runs the app, and it does not grade code quality; that is backend-doctor and backend-security."
---

# Backend Scan

Learn what a backend project is made of and record it in project memory. Scan is read-only apart from its memory files.

## When to Use

- The user wants to explore, map or summarize an existing backend project.
- Another backend skill found the memory folder missing, incomplete or stale.
- The user says "refresh memory", "sync memory" or "update memory", or a large change just landed.

Not for: grading code quality or security (backend-doctor, backend-security), or answering a single question about one file (just read the file).

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs, e.g. Claude.ai), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, checkpoints) and `<shared>/host-tools.md` if the actions below don't map clearly to your host's tools. Read `<shared>/memory-schema.md`: it defines every memory file you write.
3. Load project memory per `<shared>/context-loading.md`. Missing memory is normal for this skill: it is the skill that creates it. Do not call backend-scan from here.
4. If the detected stack matches a file in `<shared>/stacks/`, read it.

Skill-specific checks:

- REQUIRED: at least one manifest or source directory exists. If not, stop and ask the user for the project path. Scan cannot create project files.
- RECOMMENDED: git is available. Without it, use filesystem-only drift detection and say in the summary that git-based staleness checks were skipped.
- If any memory file contains merge-conflict markers (`<<<<<<<`, `=======`, `>>>>>>>` at line start), stop and ask the user to resolve them. Never ingest conflict markers as facts.

## Inputs

- `scope=initial | sync` (optional): what to scan. If the caller omits it, choose per memory file (Step 1).
- Run mode: `mode=auto` or `mode=interactive`, exactly as defined in `<shared>/tool-rules.md` -> `mode=auto` Contract. Scan does not redefine it.
- Compatibility: a caller that passes `mode=initial` or `mode=sync` means `scope=initial` or `scope=sync`. The run mode is then inherited from the caller, else `mode=auto`.
- `path=<dir>` (optional): the service to scan inside a monorepo.

## Read-Only Rule

- Allowed: find files, read files, search file contents, check LSP symbols or diagnostics if available, and read-only git (`git status`, `log`, `diff`, `show`, `rev-parse`).
- The only files scan writes are in `.opencode/everything-backend-memory/` (memory files, their archive and checkpoint files).
- Never install dependencies, run builds, tests, migrations, `docker compose`, the application, or any project script (package scripts and install hooks execute repository code).
- Use LSP only if the language server is already running or does not execute build scripts. Some servers run repository code on project import (rust-analyzer runs `build.rs` and proc macros; Java/Kotlin servers evaluate Gradle or Maven files). That counts as running project code.
- If a fact can only be learned by running something, record it as `unknown` and name the skill that can find out (for example backend-test or backend-doctor). Running it needs the user's confirmation, in `mode=auto` too.

Under the shared contract, scan's reads and memory writes run without asking. Everything else is outside scan's scope.

## Workflow

### Step 1: Pick scope and check memory state

1. List the files in `.opencode/everything-backend-memory/`.
2. Decide per file, not all-or-nothing:
   - A memory file that does not exist: initialize it (initial behavior), even during a sync.
   - A file that exists but has no `## Last Updated`: treat it as stale.
   - Otherwise: sync behavior.
3. In sync, check staleness for each existing file. Compare its `## Last Updated` with the last first-parent commit that touched the paths it describes:
   `git log --first-parent -1 --format=%ct -- <paths>`
   `--first-parent` makes merge commits count; without it, a merged feature branch can report the feature commit's older date. If the file records a source SHA, prefer `git diff --quiet <sha> HEAD -- <paths>` (exit 1 means changed).
4. Start a checkpoint before the first memory write:
   `node <shared>/scripts/checkpoint.js start --skill backend-scan --feature <scope>-scan`
   Use `initial-scan` if any core memory file is missing, else `sync-scan`, and keep the same slug for every later checkpoint call in this run. If it exits 3, an open scan checkpoint exists: offer to resume or restart (`--restart`). If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.

Output: the scope per memory file and the list of stale files. Done when every one of the 6 core memory files has a decided action (create, sync, or up to date).

### Step 2: Map the project

1. Detect workspaces first (pnpm-workspace.yaml, `workspaces` in package.json, turbo.json, nx.json, go.work, Cargo workspace, multi-project Gradle or Maven, several service folders each with a manifest). If there are several backend services and no `path=` was given, list them and ask which to scan. Note frontends and other apps without scanning them.
2. Find manifests and lockfiles, then detect language, package manager, frameworks, ORM, database, migrations tool, auth, cache, queues and test runner. Use `references/stack-detection.md`.
3. Map the directory structure and entry points. Skip vendored, generated and build output (exclusion list in `references/stack-detection.md`). Mark generated code as generated.
4. Extract the facts the memory schema requires: tables and relationships, endpoints and base path, auth method, error shape, conventions, existing ADRs. Use the extraction recipes in `references/stack-detection.md`. Keep a source path (file:line where practical) for each fact.
5. Identify the architecture style (MVC, layered, clean, hexagonal, modular monolith, microservices). If unclear, record `undetermined`.
6. Note conventions and notable observations without grading them. They go to `## Notable Conventions` in project-overview.md and to the summary's Key Findings. Do not assign severities: grading is backend-doctor's and backend-security's job (see `<shared>/principles.md` for the vocabulary).

Budget: on large repos, read representative files per layer rather than everything. Say in the summary what was sampled.

Done when each required section of each memory file has either a value with a source or an explicit `unknown`.

### Step 3: Compare with memory (sync files only)

1. Read the current memory file and compare it with the live facts (see `<shared>/memory-schema.md` -> Conflict detection algorithm).
2. Classify each difference:
   - **New**: in code, not in memory -> add.
   - **Modified**: in both, different -> update. Live code wins.
   - **Missing from code**: in memory, not in code. If the entry is marked Planned or was written by a design skill (backend-db-design, backend-api-design, backend-architect, backend-auth) and was never seen in code, leave it and list it as "planned, not yet implemented". Otherwise mark it `[DEPRECATED]`. Never remove an entry.
   - **Conflict**: memory and code disagree in a way that is not mechanical (for example a renamed table that could also be a new one, or a decision that the code contradicts). Do not auto-resolve.
3. If nothing differs, the file is up to date: refresh nothing and report "up to date".

Output: a change list per file. Done when every difference is classified.

### Step 4: Write memory

1. In `mode=auto`, write new files and apply New, Modified and Missing-from-code updates without asking. Pause only for conflicts: apply everything else, then ask about the conflicts. In `mode=interactive`, show the planned memory diff and wait for approval before any write.
2. Use the entry format each file's schema defines (`<shared>/memory-schema.md`). Templates are in `references/output-templates.md`:
   - Inventory files (project-overview, tech-stack, api-patterns, db-schema): a timestamped `Initial Scan` or `Sync Update` entry.
   - decisions.md: one entry per decision with Context, Decision, Consequences, Status. Decisions inferred from code get `Status: Proposed` and the note "Inferred by backend-scan from code; confirm with the team". Never mark an inferred decision Accepted.
   - issues.md: only facts scan can see without grading (for example TODO/FIXME markers). Aggregate TODOs into one issue per module with a count and sample locations, Severity Low, Status Open. Before adding, check issues.md for an existing entry on the same location; update it instead of duplicating.
3. Preserve existing content: append, don't overwrite. Refresh `## Last Updated` only on files you changed. If git is available, record the current `git rev-parse HEAD` in the entry as `Source SHA:`.
4. Record each memory file you wrote: `node <shared>/scripts/checkpoint.js record --skill backend-scan --feature <scope>-scan --memory <file>`.
5. Compact per `<shared>/memory-schema.md` -> Compaction rule and Memory file size guard. Protected entries (latest current-state entry, Open or In Progress issues, Accepted non-superseded decisions, Proposed decisions) are never archived. Archive names never overwrite an existing archive.

Done when every planned write is applied or explicitly deferred as a conflict.

### Step 5: Verify and report

1. Re-read each memory file you wrote. Check that every required section from `<shared>/memory-schema.md` is present, and that no conflict markers or template placeholders remain.
2. Close the checkpoint: `node <shared>/scripts/checkpoint.js close --skill backend-scan --feature <scope>-scan --status completed` (use `--status abandoned` if the user stops the run).
3. Report with the Discovery Summary (initial) or Change Summary (sync) from `references/output-templates.md`. Fill the per-file status from what actually happened: created, updated, up to date, partial (list missing sections), or failed (with the reason). Never pre-fill success.

## Exit Criteria

The run is complete when all of these hold:

- Each of the 6 core memory files (project-overview, tech-stack, api-patterns, db-schema, decisions, issues) exists and has its required sections, or the summary reports it as partial with the missing sections named.
- Every unknown fact is written as `unknown` with the skill that can resolve it.
- Conflicts are listed for the user, not silently resolved.
- No command other than read-only inspection ran, and no file outside the memory folder changed.
- The summary reports per-file status, what was sampled or skipped, and whether git staleness checks ran.

test-strategy.md (owner backend-test) and deployment.md (owner backend-deploy) are not scan outputs. Scan may note facts for them in the summary, but it does not create them.

## Edge Cases

- **No manifest found**: ask the user about the stack; do not guess.
- **Several languages**: focus on the backend language; note the others in project-overview.md.
- **Monorepo**: see Step 2.1. One memory folder per project root; record which service was scanned in project-overview.md.
- **No clear architecture**: record `undetermined`; ask only in `mode=interactive`.
- **scope=initial but memory exists**: append findings; never overwrite.
- **scope=sync but no memory**: initialize the missing files (Step 1.2).
- **Generated code**: note which folders are generated; don't extract conventions from them.
- **No changes**: report "Memory is up to date" per file.

## References

- `references/stack-detection.md`: read in Step 2 to detect language, framework, ORM, database and test tooling per ecosystem, to extract tables, endpoints and conventions, and for directory-structure hints and the exclusion list.
- `references/output-templates.md`: read in Steps 4 and 5 for memory entry formats and the discovery and change summary templates.
