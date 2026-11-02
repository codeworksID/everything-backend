---
name: backend-refactor
description: "Perform behavior-preserving refactoring on existing backend code. Supports Node.js, Python, Go, and Java. Covers splitting fat controllers and services, extracting modules, reducing coupling, dependency inversion, strangler-fig migrations, and legacy modernization. Use this skill when the user says 'refactor', 'cleanup', 'split service', 'split controller', 'reduce coupling', 'extract module', 'modernize legacy', 'strangler fig', or 'behavior-preserving refactor'."
---

# Backend Refactor

## When to Activate

- User says "refactor", "cleanup", "clean up", "restructure"
- User says "split service", "split controller", "break up"
- User says "reduce coupling", "decouple", "extract module"
- User says "modernize legacy", "strangler fig", "incremental rewrite"
- User says "rename symbol", "move file", "reorganize"
- Code review flagged a maintainability or structure concern that requires restructuring without changing behavior

> **Boundary**: If the request involves fixing a bug or adding a feature, stop and redirect to `backend-implement`. Refactoring and feature work must never share the same change set.

## Out of Scope

- Bug fixes, defect resolution, or patching incorrect behavior
- New features, endpoints, fields, or capabilities
- Database schema migrations (use `backend-migrate`)
- New test authoring from scratch (use `backend-test`)
- Architecture redesign or greenfield planning (use `backend-architect`)

**HARD RULE**: A refactor MUST NOT change observable behavior. Every externally visible contract — request/response shapes, status codes, error types, side effects, event payloads, CLI output — must remain identical before and after. If you cannot prove behavior is preserved, stop and ask for clarification.

## Prerequisites

See `_shared/context-loading.md` for standard prerequisites (project root check, manifest detection, memory file presence, fallback rules, and context priority list).

Refactor-specific prerequisites:

- REQUIRED: Existing test suite exists (at least one test runner detected)
  - Check: `glob **/{jest.config*,vitest.config*,pytest.ini,pyproject.toml,go.mod,*Test.java,*_test.go}`
  - Also check: `glob {tests,test,__tests__,spec}/**`
  - If missing: stop and ask the user to confirm a test suite or run `backend-test` first. Do not refactor without a safety net.
- REQUIRED: Clean working tree (rollback depends on it)
  - Check: `git status --porcelain -- . ":(exclude).opencode/everything-backend-memory"` at run start, and record the output and `git rev-parse HEAD` (the run-start SHA) in the checkpoint. The skills' own memory folder (memory files, checkpoints, baseline reports) is excluded on purpose: it is not part of the refactor and is never "user changes". If it shows up as untracked in other commands, suggest adding `.opencode/everything-backend-memory/` to `.gitignore` (ask first; editing `.gitignore` is the user's call).
  - If not a git repository: stop and ask. Rollback relies on the run's own git patches.
  - If the output is non-empty: stop and ask. The user can commit or stash their changes themselves, or tell you to proceed with the dirty files recorded in `pre_existing_changes[]` as off-limits (never edited by this run, never touched by rollback). If an off-limits file is inside the refactor scope, the user must commit or stash it first.
  - Never stash, commit, reset, or check out on the user's behalf without asking (see `_shared/tool-rules.md` → Always Ask First).
- REQUIRED: Tests currently pass (green baseline)
  - Run the test suite via `bash` before any structural change, within `_shared/tool-rules.md` → Command Time Budgets. A run that does not complete is "not verified", never a green baseline.
  - Run the Target Check from `backend-test` first: unless the command provably runs only hermetic unit tests, confirm every database, queue, and external target is provably local (see `_shared/tool-rules.md` → Production Targets), and ask first if a test hook migrates, resets, or seeds a database; otherwise ask before running.
  - If tests fail: stop and report. Fixing failing tests is not a refactor.
- RECOMMENDED: `project-overview.md` and `tech-stack.md` exist in memory
  - If missing: run `backend-scan` with `mode=auto` to populate memory
- RECOMMENDED: `api-patterns.md` exists when refactoring controllers/routes
  - If missing: note the gap and proceed; use `grep`/`glob` to discover endpoints manually

## Required Context

See `_shared/context-loading.md` for the standard context priority list and loading rules.

Refactor-specific overrides:

- Always load: `project-overview.md`, `tech-stack.md`
- Load when refactoring API-facing code: `api-patterns.md`
- Load when refactoring data access: `db-schema.md`
- Lazy-load: `decisions.md` only when the refactor involves architectural pattern choices (e.g., switching from direct ORM calls to repository pattern)
- Skip: `deployment.md`, `test-strategy.md` (unless the refactor touches deploy config or test infrastructure)

## mode=auto

Follow the shared `mode=auto` contract in `_shared/tool-rules.md`.

Refactor-specific additions:

- **Trigger**: user says "refactor X to Y", "split this service", "clean up", or an orchestrator invokes this skill.
- **Behavior**:
  - Run the test suite as a baseline before any code change (Step 1 of Core Process).
  - Proceed autonomously through characterization tests, structural changes, and verification.
  - **Pause when**: the refactor target is ambiguous (e.g., "refactor the codebase" without specifying which module), when the working tree is dirty at run start, when the test suite has pre-existing failures, when the proposed change would break the public API contract, or before deleting a file this run did not create.
- **Exit condition**: every test that passed in the baseline still passes and every added characterization test passes (normalized per-test comparison, Step 7), LSP diagnostics clean, summary reported.

## Core Process

### Step 1: Characterization Tests & Baseline Lock

Before touching any code, lock the current behavior.

All baseline artifacts go in this run's checkpoint directory, `.opencode/everything-backend-memory/.checkpoints/backend-refactor-<feature>-<YYYYMMDDTHHMMSSZ>/` (called `<ckpt>` below). That folder is inside the project tree but is not part of the refactor; it is excluded from the clean-tree check and should be gitignored (see Prerequisites).

1. Run the full test suite with a machine-readable per-test report, and record the runner's own exit code. Let the runner write the report file itself instead of piping: `cmd | tee file` returns `tee`'s exit code and hides a red suite.
   ```bash
   # bash: no pipe, so $? is the runner's exit code
   npx jest --json --outputFile=<ckpt>/baseline.json; echo "exit=$?"
   npx vitest run --reporter=junit --outputFile=<ckpt>/baseline.xml; echo "exit=$?"
   pytest --junitxml=<ckpt>/baseline.xml; echo "exit=$?"
   go test -json ./... > <ckpt>/baseline.jsonl; echo "exit=$?"   # bash only
   # Maven/Gradle: run the normal test goal, then copy target/surefire-reports/*.xml
   # or build/test-results/test/*.xml into <ckpt>/
   ```
   In PowerShell, read `$LASTEXITCODE` on the line right after the command, and run `go test -json` under bash or as `cmd /c "go test -json ./... > <ckpt>\baseline.jsonl"` (cmd writes the bytes unchanged; `$LASTEXITCODE` is go's exit code). Never use `>` for patch or report files in Windows PowerShell 5.1: it writes UTF-16LE, which `git apply` and JSON parsers reject. Patches are always written with `git diff --output=<file>` (see Step 5), never with a shell redirect. If a pipe is unavoidable in bash, run `set -o pipefail` first. Use the project's own test script when it wraps the runner, passing the reporter flags through (e.g. `npm test -- --json --outputFile=...` for a script that calls Jest directly).
2. Normalize the report into `<ckpt>/baseline-results.json`: a sorted list of `{test id, status}` where the id is file + suite + test name and status is `passed`, `failed`, or `skipped`. Drop durations, timestamps, seeds, and log output. This list, not a hash of raw output, is the comparison baseline.
3. If the code path being refactored has no tests, write **characterization tests** first:
   - Exercise the existing behavior through its public interface
   - Assert on current outputs, status codes, error types, and side effects
   - Name them clearly: `Characterization: [module] produces [behavior]`
   - See `backend-test` for characterization test guidance
4. Re-run the full suite (including new characterization tests) the same way and confirm it passes. If every previously passing test still passes, save its normalized result as the locked baseline in `<ckpt>/baseline-results.json`; added characterization tests appear as new `passed` entries. No structural change has been made yet, so this is the only point where the baseline may be updated.

> **Never skip this step.** Refactoring without a behavioral baseline is just guessing.

### Step 2: Behavior Lock

Establish an explicit behavioral contract for the scope of the refactor:

1. Document what must NOT change: public function signatures, HTTP contracts, error types, return shapes, side-effect order, event emissions.
2. If the refactor will change any import paths or module boundaries, list all callers that must be updated.
3. This is a planning step — no code changes yet.

### Step 3: LSP & Reference Discovery

Use LSP and search tools to map the blast radius before making structural changes.

1. `lsp_symbols` on the target file to enumerate exports, classes, and functions.
2. `lsp_find_references` on each symbol that will move or be renamed.
3. `grep` for dynamic references that LSP may miss (string-based imports, reflection, config-driven wiring, `require()` with computed paths).
4. Record the full list of files that reference the target. These are your migration checklist.

### Step 4: Pick Refactor Pattern

Select the pattern that matches the user's intent. See the [Refactor Pattern Catalog](#refactor-pattern-catalog) below for detailed guidance on each pattern.

Decision tree:

| User intent | Pattern |
|---|---|
| "This controller/service does too much" | [Split Fat Controller/Service](#split-fat-controller--service) |
| "Extract this into a separate module" | [Extract Module](#extract-module) |
| "Too many dependencies / hard to test" | [Reduce Coupling](#reduce-coupling) |
| "Depend on abstractions, not implementations" | [Dependency Inversion / Ports-and-Adapters](#dependency-inversion--ports-and-adapters) |
| "Migrate away from legacy without a big bang" | [Strangler Fig](#strangler-fig) |
| "Modernize old code style/framework" | [Modernize Legacy](#modernize-legacy) |
| "Rename or move this symbol/file" | [Rename / Move Symbol](#rename--move-symbol) |

### Step 5: Incremental Refactor

Apply the chosen pattern in small, verified increments:

1. Make one atomic structural change (extract one method, move one class, rename one symbol).
2. Update all callers identified in Step 3.
3. Run the test suite after each atomic change (time limits: `_shared/tool-rules.md` → Command Time Budgets) and compare it to the baseline as in Step 7.
4. If the run is green, save the run's changes so far, cumulative against the run-start SHA (not the index, not a moving `HEAD`): `git diff --binary --output=<ckpt>/step-<N>.patch <start-sha> -- <files this run changed>`. Then copy it to the shared patch path `.checkpoints/backend-refactor-<feature>-<YYYYMMDDTHHMMSSZ>.patch` so the shared rollback in `_shared/tool-rules.md` finds it. Files this run created are untracked and not in `git diff`: list them in `created_files[]` and copy them to `<ckpt>/step-<N>/created/`.
5. If tests fail, undo only this increment, then continue from the last green state. Do not accumulate broken states.
   - Check `git rev-parse HEAD` equals the run-start SHA; if it moved, stop and ask (see Step 8, item 2).
   - Save the failed state for the report: `git diff --binary --output=<ckpt>/failed-<N>.patch <start-sha> -- <files this run changed>`
   - Reverse it: `git apply -R --check <ckpt>/failed-<N>.patch`, then `git apply -R <ckpt>/failed-<N>.patch`; re-apply the last green state: `git apply <ckpt>/step-<N-1>.patch` (skip for the first increment)
   - Remove files that this increment created and restore earlier run-created files from `<ckpt>/step-<N-1>/created/` (this run created them, so no confirmation is needed)
   - If `git apply` fails because files changed outside this run, stop and show the conflict. Never force it, and never use `git checkout -- <file>`, `git reset --hard`, or `git clean`.
6. Run `lsp_diagnostics` on all changed files after each change.
7. Repeat until the pattern is fully applied.

**Increment size rule**: each increment should leave the codebase in a fully working state. If a change requires touching more than ~5 files, break it down further. The user may commit green increments themselves; commit on their behalf only when they ask (see `_shared/tool-rules.md` → Always Ask First). Patches stay relative to the run-start SHA, so they still describe the whole run after such a commit, but undoing committed increments works differently (see Step 8, item 2).

**Deletion rule**: removing code inside a file is part of the refactor. Deleting a whole file or module that this run did not create (an old file after a move, a legacy module after a strangler fig) is listed in the plan and done only after confirmation, in `mode=auto` too.

**Retired tests**: tests that only cover code removed under the Deletion rule may be removed in the same confirmed step. Before asking, show which tests on the new module cover the same behavior; if that behavior is not covered, add or move tests first. List the removed tests in the summary as "retired with `<module>`". This is not a Test Integrity exception: a test that fails while its code still exists is never removed.

### Step 6: Strangler Fig (When Applicable)

For large-scale migrations or legacy replacement:

1. Create the new module/service alongside the old one (not replacing it).
2. Add a routing layer or feature flag that directs traffic to the new implementation.
3. Migrate callers one at a time, verifying after each.
4. Remove the old implementation only when zero callers remain, and only after confirmation (see the Deletion rule in Step 5).
5. Remove the routing layer/feature flag once the old code is deleted.

### Step 7: Verification

After the refactor is complete:

1. Run the full test suite as in Step 1 and normalize the result. Compare it per test against `<ckpt>/baseline-results.json`:
   - Every baseline `passed` test must still be `passed`. A test that is now `failed`, `skipped`, or missing is a regression.
   - If a test id changed only because the refactor moved or renamed its file or suite, map old id to new id explicitly in the summary. Tests retired with a confirmed module deletion (see Retired tests in Step 5) are listed as such. Any other missing test is a regression.
   - New tests (e.g. characterization tests added during the run) must pass.
   - Timings, ordering, and log output are ignored.
2. Run `lsp_diagnostics` on every changed file — zero errors required.
3. Run `lsp_find_references` on the old location/symbol to confirm zero dangling references remain.
4. Verify no new `any` types, suppressed errors, or linting violations were introduced.
5. If the refactor touched API-facing code, run a quick contract verification (e.g., `curl` a representative endpoint or run contract tests).

### Step 8: Rollback

If any verification step fails and the fix is not obvious, roll back this run's own changes only, following `_shared/tool-rules.md` → Concurrent & Partial Work (Rollback):

1. Use `git diff` to review all changes and show the user which files this run changed and created.
2. Check `git rev-parse HEAD` against the run-start SHA. If HEAD moved (the user committed increments), stop and ask: committed increments are undone only by a `git revert` the user approves (see `_shared/tool-rules.md` → Always Ask First), never by reverse-applying patches over them.
3. Undo from the saved patches, never from a fresh diff. A patch generated now always reverse-applies cleanly and would silently discard edits the user made since; a diff taken at rollback time is only for the report.
   - Confirm that the current `git diff <start-sha> -- <files this run changed>` equals the last saved `<ckpt>/step-<N>.patch` plus the in-progress increment recorded in the checkpoint, if any. On a mismatch, stop and show the difference.
   - Return to the last green increment (as in Step 5, item 5), or undo the whole run: first undo any in-progress increment as in Step 5, item 5, then `git apply -R --check <ckpt>/step-<N>.patch` and `git apply -R <ckpt>/step-<N>.patch`.
4. Files in `pre_existing_changes[]` (user changes at run start) are never touched.
5. If `git apply -R --check` fails because the user edited the files since, stop and show the conflicting hunks. Never force it.
6. List the files in `created_files[]`; delete them only after the user confirms.
7. Never use `git checkout -- <file>`, `git reset --hard`, `git clean`, or a reset to an earlier commit for rollback.
8. Re-attempt the refactor with a smaller increment or a different decomposition.
9. Never ship a partially-refactored state.

## Refactor Pattern Catalog

### Split Fat Controller / Service

**Problem**: A controller or service handles multiple unrelated concerns, is hundreds of lines long, or is impossible to unit test.

**Approach**:

1. Identify cohesive responsibility groups within the fat unit (e.g., user CRUD vs. user notifications vs. user analytics).
2. Extract one group at a time into a new service or use-case class.
3. Move business rules, invariants, and transaction ownership into the extracted service.
4. Leave the original controller/handler as thin transport glue that delegates to the new service.
5. Inject the new service through the composition root.
6. Add or update tests for the extracted service.
7. Delete deprecated methods from the original once callers are migrated.

**Verification**: every extracted method has at least one unit test; the controller/handler has no business branching beyond validation and response mapping.

### Extract Module

**Problem**: A file or directory has grown too large or contains logic that belongs in a distinct bounded context.

**Approach**:

1. Identify the cohesive subset of code to extract (functions, classes, routes).
2. Create the target module with a clean public interface (single entry point or barrel export).
3. Move the code, preserving all internal dependencies.
4. Update all import paths in the source module and all external callers.
5. Re-export or alias from the old location temporarily if many callers exist; deprecate with a comment.
6. Remove the alias once all callers are updated.

**Verification**: `lsp_find_references` returns zero results for the old import path; `lsp_diagnostics` clean on both old and new locations.

### Reduce Coupling

**Problem**: A module depends on too many concrete implementations, making it hard to test or change.

**Approach**:

1. Map incoming and outgoing dependencies of the target module.
2. Identify dependencies that are implementation details (direct DB access, HTTP clients, file I/O).
3. Define interfaces/ports for those dependencies.
4. Replace direct usage with interface references.
5. Move concrete implementations into separate adapter modules.
6. Inject adapters through the composition root or a DI container.
7. Replace adapters with fakes in tests.

**Verification**: the target module imports no concrete infrastructure packages; unit tests run without infrastructure (no database, no HTTP server).

### Dependency Inversion / Ports-and-Adapters

**Problem**: Core business logic depends on framework or infrastructure, preventing testing and reuse.

**Approach**:

1. Define the domain or service layer with no outward dependencies (pure business rules).
2. Define ports (interfaces) for every external interaction (persistence, messaging, HTTP, file system).
3. Implement adapters that fulfill those ports using concrete infrastructure.
4. Wire adapters in the composition root.
5. Replace adapters with test doubles in unit tests.

**Verification**: `grep` for framework imports (`express`, `fastify`, `@nestjs`, `django`, `gin`, `spring`) inside the domain/service layer returns zero matches.

### Strangler Fig

**Problem**: A legacy module is too large or too risky to replace in one shot.

**Approach**:

1. Identify the boundary of the legacy module (API surface, message handlers, CLI commands).
2. Build the replacement module behind the same interface.
3. Add a router/facade/feature flag that selects between old and new.
4. Migrate callers one by one, testing after each switch.
5. Remove the old module and the routing layer when migration is complete (deleting the old module's files needs confirmation; see the Deletion rule in Step 5).

**Verification**: all callers route through the new module; the old module has zero references; tests pass with the old module deleted.

### Modernize Legacy

**Problem**: Code uses outdated patterns, deprecated APIs, or style conventions that harm maintainability.

**Approach**:

1. Identify the target modernization (e.g., callbacks to async/await, class components to functions, old ORM API to new).
2. Write characterization tests for the current behavior.
3. Apply the modernization incrementally — one function, one module at a time.
4. Run tests after each change.
5. Update linting rules or type definitions if the modernization changes conventions.

**Verification**: no behavioral change; all characterization tests pass; `lsp_diagnostics` clean.

### Rename / Move Symbol

**Problem**: A symbol (function, class, module, file) has a misleading name or is in the wrong location.

**Approach**:

1. Use `lsp_prepare_rename` to verify the symbol is safe to rename.
2. Use `lsp_rename` to apply the rename across the workspace.
3. For file moves, create the new file, update all imports, then delete the old file after confirmation (it was not created by this run; see the Deletion rule in Step 5).
4. Run `lsp_find_references` on the old name/path to confirm zero stragglers.
5. Run the test suite.

**Verification**: zero references to the old name/path; `lsp_diagnostics` clean; tests pass.

## Concurrent & Partial Work

This skill participates in the shared checkpoint contract defined in `_shared/tool-rules.md` (Concurrent & Partial Work). See that document for checkpoint format, resume, rollback, multi-feature isolation, and partial completion rules.

Refactor-specific checkpoints are written to `.opencode/everything-backend-memory/.checkpoints/backend-refactor-<feature>-<YYYYMMDDTHHMMSSZ>.json` (Windows-safe UTC timestamp, no colons), with the shared patch at `backend-refactor-<feature>-<YYYYMMDDTHHMMSSZ>.patch` (always equal to the latest green `step-<N>.patch`). As an extension of the shared contract, baseline reports, per-step patches, and copies of created files go in the sibling directory `backend-refactor-<feature>-<YYYYMMDDTHHMMSSZ>/`.

**Refactor-specific caveat**: besides the shared fields (`pre_existing_changes[]`, `created_files[]`, `modified_files[]`, patch path), every checkpoint MUST record the run-start SHA, the path of the normalized baseline (`baseline-results.json`), the run-start `git status --porcelain` output, the last green step patch, and the in-progress increment (its number and the files it touches) while one is open. On resume:

1. Check `git rev-parse HEAD` against the run-start SHA (if it moved, ask as in Step 8, item 2). Then compare `git diff <start-sha> -- <files this run changed>` with the last green step patch.
   - A match: continue from the next pending step.
   - Extra changes only in files of the recorded in-progress increment: the run was interrupted mid-increment. Show the diff and offer to undo that increment as in Step 5, item 5, or stop.
   - Changes in files outside the run's recorded set, or in run files beyond the in-progress increment: the code changed while the checkpoint was inactive. Stop and show the difference.
2. Re-run the test suite and compare it per test against the original baseline (Step 7), not against a fresh run.
3. Never re-baseline on half-refactored code. If the original baseline must be replaced, roll back to the run-start state first (Step 8) and ask.

## Edge Cases

- **No tests exist**: Do not refactor. Stop and delegate to `backend-test` to build a characterization test suite first.
- **Tests fail before refactor starts**: Do not refactor. Report the failures and stop. Fixing bugs is out of scope.
- **Ambiguous scope** (e.g., "refactor everything"): Ask the user to specify the target module, file, or concern. Do not guess.
- **Cross-module refactor**: Break into per-module increments. Each module is verified independently before moving to the next.
- **Shared mutable state**: If the code under refactor uses global state, singletons, or module-level caches, document the behavior in characterization tests before extracting.
- **Dynamic wiring** (config-driven, reflection, string-based imports): LSP may miss these callers. Use `grep` for string-literal references to the old module/path in addition to LSP lookup.
- **Circular dependencies**: If the refactor reveals circular imports, break the cycle by introducing an interface/port in the direction of the dependency inversion.
- **Large refactor (>20 files)**: Use the strangler-fig pattern. Do not attempt a big-bang rename/move across the entire codebase.
- **Refactor reveals a bug**: Do not fix it in the same change. File a note in `issues.md` or create an issue, then stop the current refactor step. Fixing the bug is a separate task.
- **Platform-specific paths**: Use OpenCode-native tools (`glob`, `read`, `grep`) for file discovery. When shell commands are unavoidable, prefer PowerShell on Windows, bash on Unix. Never hard-code Unix-only paths.

## See Also

- `backend-orchestrator` — routes refactor requests here
- `backend-scan` — populates memory files used as context
- `backend-test` — creates or expands the test safety net required before refactoring
- `backend-implement` — for feature additions and bug fixes (out of scope here)
- `backend-doctor` — run after refactoring to verify health
- `backend-architect` — for redesigns that go beyond behavior-preserving refactoring
- `_shared/principles.md` — code/architecture principles to apply during refactoring
- `_shared/tool-rules.md` — tool usage, checkpoint, and mode=auto contracts
