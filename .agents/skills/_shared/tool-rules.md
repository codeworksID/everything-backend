# Shared Tool Rules

These rules apply whenever a backend skill needs to inspect, navigate, or change a codebase with OMO or Opencode tools.

## Default Investigation Toolkit

1. **`glob`** — map directory structure and find manifests, routes, models, migrations, configs, and tests.
2. **`read`** — inspect manifests, configs, README files, memory files, and representative source files.
3. **`grep`** — locate endpoints, auth patterns, ORM usage, validators, error classes, env vars, and changed markers.
4. **`lsp_*` tools** (`lsp_symbols`, `lsp_find_references`, `lsp_goto_definition`, `lsp_diagnostics`) — trace definitions, references, symbols, and type/compile errors in supported languages.
5. **`bash`** — run tests, lint, audits, builds, migrations, and the application itself.
6. **Agent delegation** — for parallel searches, use OMO's `call_omo_agent` or Opencode's `task()`. Use explore agents for codebase search and librarian/research agents for external framework or library research.

## How to Use Them

- Start with `glob` and `read` to build context before proposing changes.
- Use `grep` to find patterns across files; confirm findings with `read`.
- Use `lsp_*` tools to trace architectural boundaries and catch errors after edits.
- Use `bash` for dynamic checks that produce observable evidence (exit codes, output, line numbers).
- Delegate broad or cross-cutting searches to the platform agent call (OMO: `call_omo_agent`, Opencode: `task()`) with explore/research parameters.

## Error Handling

- **Command not found**: Report it as a tooling issue, suggest the install command or required setup, and do not treat the result as "all good".
- **Command timeout (>30s)**: Kill the process, report the failure clearly, and suggest manual investigation.
- **Partial failure**: Report what succeeded and what failed separately; do not collapse mixed results into a single pass/fail verdict.
- **Tool unavailable (e.g., LSP not configured)**: Note it explicitly in the output; do not silently skip checks.
- **Never silently swallow errors**: Do not present "all good" or a clean status when a check did not run or failed.

## `mode=auto` Contract

Defines exactly what `mode=auto` means for every skill that supports it.

- **Trigger**: a workflow pipeline invokes the skill, or the user's intent is unambiguous (e.g., "scan", "test", "run doctor", "check my backend").
- **Behavior**:
  - Skip confirmation prompts for non-destructive actions.
  - Execute all safe steps immediately.
  - **Pause only for destructive operations**: data deletion, secret rotation, production deploys, schema drops, force-pushes.
  - **Pause for ambiguous requirements**: missing critical inputs, conflicting design decisions, risky fixes.
  - Report findings at the end of the run, not after each sub-step.
- **Exit conditions**:
  - All steps succeed → report final summary.
  - Any step finds a blocker → report and stop, but never silently drop findings.
- **Default invocation**:
  - When invoked by `backend-orchestrator` workflows, `mode=auto` is the default.
  - When invoked directly by a user, `mode=auto` is the default unless the user asks for confirmations.
  - The user or orchestrator can always force `mode=interactive` by saying "ask me before each step" or "confirm before doing X".

If a skill's individual `mode=auto` definition conflicts with this contract, the contract wins. Skills must reference this section rather than redefining the behavior.

## Concurrent & Partial Work

> **This section is the single source of truth** for checkpoint, resume, rollback, and multi-feature isolation behavior across all skills. Individual skills (backend-implement, backend-test, backend-migrate, etc.) **must not redefine** any checkpoint or resume rules — they must reference this section instead. If a skill's checkpoint logic conflicts with this contract, the contract wins.

Defines the contract for handling non-linear work (interrupted runs, parallel features, rollback requests).

- **Checkpoint files**: when `mode=auto` runs generate code or memory updates, write a checkpoint to `.opencode/everything-backend-memory/.checkpoints/<skill>-<ISO-timestamp>.json` containing: skill name, started_at, completed_steps[], pending_steps[], generated_files[], memory_updates[].
- **Partial completion**: skills must check for an open checkpoint at start. If one exists for the same skill, offer to resume (continue from `pending_steps[0]`) or restart (ignore the checkpoint).
- **Rollback**: when a user requests to undo a generated file set, the skill must read the checkpoint, list every file that was created or modified, and present a `git checkout -- <file>` command for each. Skills must never delete user code automatically.
- **Multi-feature isolation**: each `mode=auto` run that generates code MUST name a feature slug (e.g., `feature=user-registration`). Checkpoints and git branches are keyed on this slug. Two concurrent features must not share a checkpoint.
- **Resume after interruption**: when a tool fails or the user pauses mid-run, the next invocation should detect the checkpoint and resume from the next pending step, not restart from scratch.
