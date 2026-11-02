---
name: backend-refactor
description: "Performs behavior-preserving refactoring of existing backend code (Node.js/TypeScript, Python, Go, Java and similar stacks): splitting fat controllers and services, extracting modules, reducing coupling, dependency inversion, renames and moves, strangler-fig replacement, and legacy modernization. Locks a green per-test baseline first, changes code in small verified increments, and can undo its own changes from saved patches. Use when the user says 'refactor', 'clean up', 'restructure', 'split this service', 'split controller', 'reduce coupling', 'decouple', 'extract module', 'rename or move this', 'modernize legacy code', 'strangler fig', or 'behavior-preserving refactor'. Not for bug fixes or behavior changes (backend-debug), new features (backend-implement), or database schema migrations (backend-migrate)."
---

# Backend Refactor

Restructure existing backend code without changing what it does. Every increment is checked against a locked test baseline, and every change can be undone from the run's own patches.

## When to Use

- "refactor", "clean up", "restructure", "reorganize"
- "split service", "split controller", "break up this file"
- "reduce coupling", "decouple", "extract module", "introduce a repository / ports and adapters"
- "modernize legacy", "strangler fig", "incremental rewrite"
- "rename symbol", "move file"
- A review flagged a structure or maintainability problem that needs restructuring, not a behavior change.

## Not This Skill

| Request | Route to |
|---|---|
| Fix a bug, a failing test, a 500, wrong output, or any intended behavior change | `backend-debug` |
| Add a feature, endpoint, field, or capability | `backend-implement` |
| Change the database schema or data | `backend-migrate` |
| Build a test suite from scratch | `backend-test` |
| Redesign the architecture or plan greenfield work | `backend-architect` |

"Migrate" here means code or framework migration (e.g. strangler fig, an old API to a new one). Database migrations belong to `backend-migrate`.

Refactors never share a change set with a fix or a feature. If the request mixes them, do the refactor first (or ask which comes first) and hand the rest off.

**HARD RULE**: a refactor MUST NOT change observable behavior. Request and response shapes, status codes, error types, side effects and their order, transaction scope, event payloads, CLI output, and log or metric names that alerts depend on stay identical. If you cannot show that behavior is preserved, stop and ask.

**HARD RULE (query safety)**: a refactor MUST NOT change how a query is parameterized or drop an owner predicate. Bound values stay bound, allowlisted identifiers stay allowlisted, and every `tenant_id`/`user_id` predicate bound from the authenticated principal survives the move (`<shared>/sql-safety.md` -> The Rules, 1-3). Moving a query into a repository, a helper or a new ORM API is where these get lost.

## Before You Start

1. Resolve the shared docs folder ("`<shared>`"): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, Test Integrity, checkpoints) and `<shared>/host-tools.md` if the actions below don't match your host's tool names. Read `<shared>/principles.md` for the target structure, and `<shared>/memory-schema.md` before updating memory.
3. Load project memory per `<shared>/context-loading.md`: always `project-overview.md` and `tech-stack.md`; `api-patterns.md` for controllers and routes; `db-schema.md` for data access; `decisions.md` when the refactor applies an architectural pattern; `test-strategy.md` for runner conventions. If `project-overview.md` or `tech-stack.md` is missing, run `backend-scan` with `mode=auto` first, or note the gap and discover the layout by finding files and searching file contents.
4. If the detected stack matches a file in `<shared>/stacks/`, read it.
5. If the scope touches data-access code (repositories, DAOs, query builders, raw SQL, ORM calls, NoSQL filters), read `<shared>/sql-safety.md` in full.

## References

Paths are relative to this skill's folder.

- `references/patterns.md`: read in Step 4 to pick and apply a pattern (split, extract, reduce coupling, dependency inversion, modernize, rename/move), and for grouping heuristics when proposing module boundaries.
- `references/strangler-fig.md`: read when replacing a module or service side by side, or when a strangler migration spans several sessions.
- `references/baseline-and-verification.md`: read in Steps 1, 2 and 7 for test-file detection, per-runner baseline commands (bash and PowerShell), normalization, characterization tests, and the implicit-contract checklist.
- `references/increments-and-rollback.md`: read in Step 5 before the first increment, when an increment fails, when resuming, and when rolling back.
- `references/memory-updates.md`: read in Step 8 for the summary template and memory entries.

## Prerequisites

All three are REQUIRED. If one fails, stop and report; do not refactor.

1. **A real test suite.** Find actual test files (not just `pyproject.toml` or `go.mod`; patterns per stack in `references/baseline-and-verification.md`), and the baseline run must execute more than zero tests. If there is none, hand off to `backend-test` to build a characterization suite first.
2. **A clean working tree.** Run `git status --porcelain -- . ":(exclude).opencode/everything-backend-memory"`. The skills' memory folder is excluded on purpose; if it appears as untracked elsewhere, suggest adding `.opencode/everything-backend-memory/` to `.gitignore` (ask first).
   - Not a git repository: stop and ask. Undo depends on git patches.
   - Dirty tree: stop and ask. The user can commit or stash their changes themselves, or tell you to proceed with the dirty files recorded in `pre_existing_changes[]` as off-limits (never edited, never touched by rollback). If an off-limits file is inside the refactor scope, the user must commit or stash it first.
   - Never stash, commit, reset, or check out for the user without asking (`tool-rules.md` -> Always Ask First).
3. **A green baseline.** Run the suite before any change (Step 1), within `tool-rules.md` -> Command Time Budgets and after the Target Check (Production Targets). A run that does not complete is "not verified", never green. If tests fail, stop and report: failing tests go to `backend-debug`, not into a refactor.

## mode=auto

Follow `tool-rules.md` -> `mode=auto` Contract; it wins over anything here. This skill may run the baseline and verification suites when every target is provably local, write characterization tests, and edit source files in scope.

Pause and ask when:

- The target is ambiguous (e.g. "refactor the codebase"). Ask for the module, file, or concern.
- The working tree is dirty at run start, or the baseline has failures.
- The decomposition creates new modules or services, or moves module boundaries (Step 4). Show the proposal first.
- A change would alter a public contract or an item on the implicit-contract list.
- Before deleting a file this run did not create, editing files outside the stated scope, or adding or upgrading a dependency.

## Workflow

### Step 0: Start the Checkpoint

Pick a feature slug (e.g. `split-order-service`). Start a checkpoint before the first edit:

`node <shared>/scripts/checkpoint.js start --skill backend-refactor --feature <slug> --steps "baseline,behavior-lock,discovery,plan,refactor,verify,report"`

- Exit code 3: an open checkpoint exists for this slug. Offer to resume (`references/increments-and-rollback.md` -> Resume) or restart with `--restart`.
- Record `git rev-parse HEAD` as `start-sha.txt` in the run folder `.opencode/everything-backend-memory/.checkpoints/<id>/` (called `<run-dir>`).
- Record each file you create or edit (`checkpoint.js record`), mark each workflow step finished (`checkpoint.js record --done <step>`), snapshot after each green increment, and close the checkpoint when done. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand (see `references/increments-and-rollback.md` -> Manual Fallback).

Done when: the checkpoint is open and the run-start SHA is recorded.

### Step 1: Baseline Lock

1. Run the full suite with a per-test report written by the runner itself (no `tee`), and record the runner's exit code. Commands per runner and shell: `references/baseline-and-verification.md`.
2. Normalize it into `<run-dir>/baseline-results.json`: sorted `{id, status}` entries, no timings or logs.
3. If the code path in scope has no tests, write characterization tests through its public interface, asserting current behavior, even if it looks wrong.
4. Re-run and confirm everything that passed still passes; save the result as the locked baseline. This is the only point where the baseline may change.

Done when: `baseline-results.json` exists, every baseline test in scope passes, and more than zero tests ran.

### Step 2: Behavior Lock

Write down what must not change for this scope: public signatures, HTTP contracts, error types, return shapes, side-effect order, event emissions, and the implicit contracts that apply (transaction scope, framework proxies such as `@Transactional` self-invocation, DI wiring, query count on hot paths, log and metric names, and query safety for data-access code: placeholders, identifier allowlists, owner predicates). Checklist: `references/baseline-and-verification.md` -> Implicit-Contract Checklist. Planning only, no code changes.

Done when: the contract list is written into the plan.

### Step 3: Reference Discovery

Map the blast radius before moving anything:

1. List the target's exports, classes, and functions (document symbols via LSP if available, otherwise read the file).
2. Find references to every symbol that will move or be renamed (LSP find-references if available).
3. Search file contents for references LSP misses: string-based imports, reflection, DI registrations, config-driven wiring, computed `require()` paths, route tables.
4. Record every referencing file. This is the caller checklist.

Done when: every caller of the code in scope is listed.

### Step 4: Plan and Pick a Pattern

Choose the pattern from `references/patterns.md`. For in-process moves across many files, use an alias or facade; use a strangler fig (`references/strangler-fig.md`) only to replace a module or service side by side.

Write the plan: the target structure, the increments in order, the files each touches, and any file deletions. If the plan creates new modules or services or changes module boundaries, present the proposed decomposition (groups, what moves where, and why, using the grouping heuristics) and wait for approval, in `mode=auto` too.

Done when: the plan is written, and approved if it changes module boundaries.

### Step 5: Incremental Refactor

Read `references/increments-and-rollback.md` before the first increment. For each increment:

1. Note the increment and its files in `<run-dir>/in-progress.json`, then make one structural change (extract one method, move one class, rename one symbol) and update its callers from Step 3.
2. Check diagnostics on the changed files (LSP diagnostics if available, otherwise the project's type-check or compile command).
3. Run the suite and compare per test with the baseline (Step 7 rules).
4. Green: record the files (`checkpoint.js record`), run `checkpoint.js snapshot`, and save `<run-dir>/step-<N>.patch`.
5. Red: undo only this increment from the saved patches, then continue from the last green state. Never use `git checkout -- <file>`, `git reset --hard`, or `git clean`.

Rules:

- **Size**: each increment leaves the code green. If one touches more than about 5 files, split it. Exception: a tool-driven mechanical change (LSP rename, codemod, namespace bump such as `javax` to `jakarta`) that cannot be split may be one increment if it is green afterwards.
- **Commits**: the user may commit green increments; commit for them only when asked. If `HEAD` moves, follow Committed Increments in the reference.
- **Deletion**: removing code inside a file is part of the refactor. Deleting a whole file or module this run did not create (the old file after a move, a legacy module after a strangler fig) is listed in the plan and done only after confirmation, in `mode=auto` too.
- **Retired tests**: tests that cover only code removed under the Deletion rule may be removed in the same confirmed step. First show which tests on the new code cover the same behavior; if none do, add or move tests first. List them as "retired with `<module>`". This is not a Test Integrity exception: a test that fails while its code still exists is never removed or loosened.
- **Characterization tests** stay until Step 7 passes. Replacing them with cleaner tests is a follow-up for `backend-test`.
- **Bugs found**: do not fix them here. Log them in `issues.md` for `backend-debug` (Step 8) and keep the characterization test asserting the current behavior.
- **Unsafe queries found**: a query that already builds SQL from strings with untrusted input, uses an unsafe raw API with input, or lacks an owner predicate is a security bug, not refactor debt. Do not silently fix it inside a behavior-preserving increment, and do not carry it into the new code as if it were fine. Stop that part, report it to the user with `file:line` and severity (`<shared>/sql-safety.md` -> Verification, step 5: Critical if reachable from a public or low-privilege endpoint), log it in `issues.md`, and hand it to `backend-debug`. A Critical finding is raised at once, not only in the Step 8 summary.

Done when: the plan's increments are all applied and the last one is green.

### Step 6: Strangler Fig (When Used)

Follow `references/strangler-fig.md`: the seam defaults to the old path, parity is checked against both implementations, flipping the flag in any shared or deployed environment is the user's call, and the migration is tracked in `decisions.md` and `issues.md` across sessions.

Done when: the step's planned callers route through the new code and the default path is still green.

### Step 7: Verification

1. Re-run the full suite as in Step 1 and compare per test with `baseline-results.json`: every baseline `passed` test still passes; moved or renamed tests are mapped old id to new id; retired tests are listed; new tests pass; timings and order are ignored. Anything else missing or failing is a regression.
2. Diagnostics are clean on every changed file.
3. No references remain to old locations or symbols.
4. No new `any` types, suppressed errors, disabled lint rules, or lint violations.
5. For API-facing code, run contract or integration tests, or call a representative endpoint on a provably local instance.
6. Check each implicit-contract item from Step 2.
7. If data-access code changed, run `<shared>/sql-safety.md` -> Verification steps 1-2 on the changed files: the static search over every changed file, and a full read of every changed repository/DAO file. Compare each moved query with its original: same placeholders, same allowlist, same owner predicate. A query this run made string-built or less scoped is a regression (Step 9); one that was already unsafe goes to `backend-debug` per the Unsafe queries rule in Step 5.

Done when: all checks pass, or a failing check sends you to Step 9. A check that did not run is reported as "not run", never as passed.

### Step 8: Summary and Memory

Use `references/memory-updates.md`:

1. Report the summary: pattern, structural changes, files modified, created, and deleted, test results against the baseline, implicit contracts checked, query-safety findings with `file:line` and severity (or "none found", or "not run" if Step 7 check 7 did not run), checks not run, and follow-ups.
2. Append to `project-overview.md` (Structure, Module Boundaries) when the layout or boundaries changed.
3. Append to `decisions.md` when an architectural pattern was applied or a strangler migration started.
4. Log bugs and debt found in `issues.md`. Creating an issue in an external tracker needs approval.
5. Record memory files (`checkpoint.js record --memory`), then `checkpoint.js close --skill backend-refactor --feature <slug> --status completed`.

Done when: the summary is reported, memory reflects the new structure, and the checkpoint is closed.

### Step 9: Rollback (When Needed)

If verification fails and the fix is not obvious, or the user asks to undo:

1. Return to the last green increment, or undo the whole run with `checkpoint.js rollback --dry-run`, then `checkpoint.js rollback`. Full procedure: `references/increments-and-rollback.md` -> Rollback of the Whole Run.
2. Undo only from saved patches, never from a fresh diff. If the reverse-apply check fails because the user edited files since, stop and show the conflicting hunks.
3. Files in `pre_existing_changes[]` are never touched. Created files are deleted (`--delete-created`) only after the user confirms.
4. If `HEAD` moved because of user commits, committed increments are undone only by a `git revert` the user approves.
5. Re-plan with smaller increments or a different decomposition.

Never leave the code in a state that is not green against the baseline. That is what "partially refactored" means here; a strangler migration paused between green steps is fine.

Done when: the code matches the last green state or the run-start state, and the checkpoint is closed as `abandoned` if the run stops.

## Edge Cases

- **No tests at all**: do not refactor; hand off to `backend-test`.
- **Failing baseline**: report and stop; route the failures to `backend-debug`.
- **Ambiguous scope**: ask for the target module, file, or concern. Do not guess.
- **Cross-module refactor**: one module at a time, each verified before the next.
- **Shared mutable state** (globals, singletons, module caches): capture it in characterization tests before extracting.
- **Dynamic wiring** (config, reflection, string imports, DI scanning): LSP misses these callers; search file contents for string literals of the old module or path.
- **Circular dependencies**: break the cycle with an interface or port (`references/patterns.md`).
- **Large refactor (more than about 20 files)**: in-process moves use an alias or facade over several increments; module or service replacement uses a strangler fig. No big-bang change, except the mechanical exception in Step 5.
- **Refactor needs a schema change or a dependency upgrade**: stop. Schema changes go to `backend-migrate`; dependency changes are Always Ask First.
- **Windows**: use the host's file actions for discovery; for shell commands use the PowerShell forms in `references/baseline-and-verification.md`. Never write patches or reports with a PowerShell `>` redirect.

## See Also

- `backend-orchestrator`: routes refactor requests here.
- `backend-scan`: fills the memory files used as context.
- `backend-test`: builds the safety net when none exists; replaces characterization tests after verification.
- `backend-debug`: bugs and behavior changes found or requested during a refactor, including unsafe queries found in scope.
- `backend-security`: a wider injection or BOLA audit when a refactor turns up more than one unsafe query.
- `backend-implement`: new features (out of scope here).
- `backend-architect`: redesigns beyond behavior-preserving refactoring.
- `backend-doctor`: health check after a refactor.
- `backend-visualize`: diagrams of the new structure, after memory is updated.
