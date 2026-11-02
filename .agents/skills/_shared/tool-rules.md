# Shared Tool Rules

These rules apply whenever a backend skill needs to inspect, navigate, or change a codebase with OMO or Opencode tools.

## Default Investigation Toolkit

1. **`glob`** — map directory structure and find manifests, routes, models, migrations, configs, and tests.
2. **`read`** — inspect manifests, configs, README files, memory files, and representative source files.
3. **`grep`** — locate endpoints, auth patterns, ORM usage, validators, error classes, env vars, and changed markers.
4. **`lsp_*` tools** (`lsp_symbols`, `lsp_find_references`, `lsp_goto_definition`, `lsp_diagnostics`) — trace definitions, references, symbols, and type/compile errors in supported languages.
5. **`bash`** — run tests, lint, audits, builds, migrations, and the application itself, subject to the `mode=auto` Contract and Command Time Budgets below.
6. **Agent delegation** — for parallel searches, use OMO's `call_omo_agent` or Opencode's `task()`. Use explore agents for codebase search and librarian/research agents for external framework or library research.

## How to Use Them

- Start with `glob` and `read` to build context before proposing changes.
- Use `grep` to find patterns across files; confirm findings with `read`.
- Use `lsp_*` tools to trace architectural boundaries and catch errors after edits.
- Use `bash` for dynamic checks that produce observable evidence (exit codes, output, line numbers).
- Delegate broad or cross-cutting searches to the platform agent call (OMO: `call_omo_agent`, Opencode: `task()`) with explore/research parameters.

## Command Time Budgets

There is no blanket timeout. Budget each command by category:

- **Quick probes** (version checks, `which` / `Get-Command`, single-file lint or type-check): about 60s.
- **Test suites, builds, dependency audits**: use the project's own configured timeouts (test runner config, package scripts, CI job). Without one, allow up to 10 minutes. Run them in the background if the host supports it and check for completion instead of blocking.
- **App and server starts** (e.g., a doctor smoke test): start in the background, wait up to about 60s for the readiness or health endpoint, then stop the process this run started. If it never becomes ready, report the smoke test as "did not complete".
- **Migrations and other database mutations**: never kill mid-run. If one runs longer than expected, report what is running and ask the user how to proceed.
- **Timed-out checks**: report the check as "did not complete", never as pass. Include the command, the elapsed time, and any partial output.

## Error Handling

- **Command not found**: Report it as a tooling issue, suggest the install command or required setup, and do not treat the result as "all good".
- **Command timeout**: Follow Command Time Budgets: stop the process (never a migration), report it as "did not complete", and suggest manual investigation.
- **Partial failure**: Report what succeeded and what failed separately; do not collapse mixed results into a single pass/fail verdict.
- **Tool unavailable (e.g., LSP not configured)**: Note it explicitly in the output; do not silently skip checks.
- **Never silently swallow errors**: Do not present "all good" or a clean status when a check did not run or failed.

## `mode=auto` Contract

> **This section is the single source of truth** for what a skill may do without asking. Skills reference it by name (e.g., "see `_shared/tool-rules.md` → Always Ask First") and must not redefine it. If a skill's own `mode=auto` text conflicts with this contract, the contract wins.

`mode=auto` is an allowlist: only the actions under Runs Without Asking proceed without confirmation. Anything not listed there is handled as Always Ask First. If an action matches both lists, Always Ask First wins.

- **Default**: `mode=auto` is the default when a `backend-orchestrator` workflow invokes a skill, and when a user invokes a skill directly with unambiguous intent (e.g., "scan", "test", "run doctor") without asking for confirmations.
- **`mode=interactive`**: selected by saying `mode=interactive`, "ask me before each step", or "confirm before doing X". The skill shows each planned action (with the diff for file and memory changes) and waits for approval before every file write, memory update, and command other than read-only inspection.
- **Pause for ambiguity** (both modes): missing critical inputs, conflicting design decisions, or a risky fix with more than one reasonable option.
- **Reporting**: report findings at the end of the run, not after each sub-step. If a step hits a blocker, report and stop; never silently drop findings.

### Runs Without Asking

- Read-only inspection: `glob`, `read`, `grep`, `lsp_*`, and `git status` / `log` / `diff` / `show`.
- Local hermetic commands: lint, type-check, build, unit tests that touch no external target, and formatting files this run created or edited.
- Dependency audits that only read lockfiles or installed metadata (e.g., `npm audit` without `fix`, `pip-audit` against the already-installed environment, `govulncheck`, `cargo audit`). An audit mode that resolves or installs packages (e.g., `pip-audit -r requirements.txt`, which builds a temporary virtualenv) is Always Ask First.
- Before running a build, test, or other package script, read its body (package.json `scripts`, Makefile target, test config and global setup). If it runs migrations, `db push` / seed / reset, or connects to any database, queue, or external target, treat it as an integration run: resolve every target per Production Targets and run without asking only if all are provably local.
- Creating new files, and editing existing source files in place, when they are the skill's stated output, plus the skill's memory updates; every edit is recorded in the checkpoint's `modified_files[]` and run patch (see Concurrent & Partial Work).
- Integration tests and running the application, **only** when every database, queue, cache, mail/SMS/payment provider, and other external target the run would touch is provably local (see Production Targets). Resolve the targets from env files, config, and test setup before running.

### Always Ask First

These need explicit confirmation even in `mode=auto`. Show the exact command, the resolved target, and the expected effect.

- Applying migrations or any DDL/DML to a database. Only `backend-migrate` applies migrations, and only after this confirmation. Exception: DDL against a disposable database this run started (Testcontainers, a temp SQLite file) or a migration tool's own shadow database on a provably local server runs without asking.
- Running tests or the application when any target is not provably local.
- Git operations that write refs or discard work: commit, branch switch or checkout of refs, reset, clean, stash, rebase, merge, push.
- Deleting files this run did not create, or wholesale replacing existing files or editing files outside the skill's stated output.
- Installing, upgrading, or removing dependencies (install scripts execute code).
- Deploys, image pushes, IaC apply, secret rotation, and calls to paid external APIs.
- Editing CI/CD configuration or secret files (`.env*`, credentials, key files).

### Production Targets

Treat every target as production unless it is provably local:

- `localhost`, `127.0.0.1`, `::1`, or a `*.localhost` host, but only if what listens on that port is a local process or a local container (e.g., confirmed via `docker ps` port mappings or the listener's process name). A port forwarded by a tunnel or proxy (cloud-sql-proxy, `kubectl port-forward`, `ssh -L`, AWS SSM port forwarding, a bastion tunnel) is not local; if you cannot tell what is listening, treat it as production;
- a container this run started (e.g., via Testcontainers or a `docker run` issued in this run);
- a file database (e.g., SQLite) under a temp directory.

Names such as `dev`, `staging`, or `test` in a hostname, URL, or env var are not proof. A target that cannot be resolved (e.g., `DATABASE_URL` unset and the framework default unknown) is treated as production.

### Test Integrity

- Never skip, delete, mark xfail/pending, loosen the assertions of, or regenerate snapshots for a failing test to make it pass.
- If a test's expectation is genuinely wrong (an intended behavior change), show the expectation diff and the reason, and ask first.
- Report every test file the run modified, with the reason.

## Concurrent & Partial Work

> **This section is the single source of truth** for checkpoint, resume, rollback, and multi-feature isolation behavior across all skills. Individual skills (backend-implement, backend-test, backend-migrate, etc.) **must not redefine** any checkpoint or resume rules — they must reference this section instead. If a skill's checkpoint logic conflicts with this contract, the contract wins.

Defines the contract for handling non-linear work (interrupted runs, parallel features, rollback requests).

- **Checkpoint files**: when a run generates code or memory updates, write a checkpoint to `.opencode/everything-backend-memory/.checkpoints/<skill>-<feature>-<YYYYMMDDTHHMMSSZ>.json`. The timestamp is UTC in basic format with no colons (e.g., `backend-test-user-registration-20261031T101500Z.json`), because Windows forbids `:` in filenames. The checkpoint contains: skill name, feature slug, started_at, pre_existing_changes[], completed_steps[], pending_steps[], created_files[], modified_files[], patch path, memory_updates[].
- **Run start**: record `git status --porcelain -- . ":(exclude).opencode/everything-backend-memory"` (the skills' own memory folder is never user changes). If the tree is dirty, warn the user and record the files already modified or untracked in `pre_existing_changes[]`; they are off-limits for rollback. If the run must edit one of them, first save a copy of it in the checkpoint directory.
- **After each step**: save the run's own changes to tracked files as a patch next to the checkpoint (`<skill>-<feature>-<YYYYMMDDTHHMMSSZ>.patch`, e.g., `git diff --binary HEAD -- <modified_files>`, excluding `pre_existing_changes[]`; diffing against `HEAD` keeps hunks the user staged meanwhile), and add newly created files to `created_files[]`. Untracked files the run created are not in the patch; they are tracked only via `created_files[]`.
- **No git repo**: before the first edit to an existing file, save a copy of it in the checkpoint directory and list it in `modified_files[]`. Rollback restores those copies after showing the diff and getting confirmation, and deletes `created_files[]` after confirmation.
- **Rollback**: when the user asks to undo a run:
  1. Run `git apply -R --check <patch>`, then `git apply -R <patch>`. If the check fails because the user edited those files since, stop and show the conflicting hunks; never force.
  2. Restore a pre-existing modified file only from its saved copy, after showing the diff and getting confirmation.
  3. List `created_files[]` and delete them only after confirmation.
  4. Never use `git checkout -- <file>`, `git reset --hard`, or `git clean` for rollback; they discard the user's own work.
- **Partial completion**: skills must check for an open checkpoint at start. If one exists for the same skill and feature slug, offer to resume (continue from `pending_steps[0]`) or restart (ignore the checkpoint).
- **Multi-feature isolation**: each `mode=auto` run that generates code MUST name a feature slug (e.g., `feature=user-registration`). Checkpoints are keyed on this slug, and so is any git branch the user approves (see Always Ask First). Two concurrent features must not share a checkpoint.
- **Resume after interruption**: when a tool fails or the user pauses mid-run, the next invocation should detect the checkpoint and resume from the next pending step, not restart from scratch.
