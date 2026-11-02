---
name: backend-debug
description: "Triages and fixes backend bugs with a strict loop: capture the report, reproduce it locally, write a failing test, find the root cause with evidence, apply a minimal fix, prove the test passes and the suite is green, and record the root cause in project memory. Also diagnoses performance regressions and does read-only triage of production incidents. Use when the user says 'bug', 'fix this error', 'it is broken', 'a test fails because the code is wrong', 'regression', 'exception', 'stack trace', '500 error', 'why does X happen', 'why is X slow', or 'debug this'. Not for new features (backend-implement), behavior-preserving cleanup (backend-refactor), writing migrations (backend-migrate), or a security review (backend-security)."
---

# Backend Debug

Fix the bug that was reported, prove it is fixed, and write down why it happened. Nothing else changes in the same run.

## When to Use

- A request returns 500, an exception or stack trace appears, or output is wrong.
- A test fails, a test is flaky, or behavior regressed after a change.
- The user asks "why does X happen?" or "why is X slow?".
- A production incident needs a root cause (read-only triage first; see Step 2).

Not for:
- New behavior the code never had: `backend-implement`. If the "bug" turns out to be a missing feature, say so and hand off.
- Restructuring without behavior change: `backend-refactor`, in a separate change set after the fix.
- Writing or applying migrations: `backend-migrate` (see Handoffs).
- A security review or audit: `backend-security`. A vulnerability found while debugging is logged and handed off there.

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs, e.g. Claude.ai), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, Test Integrity, checkpoints) and `<shared>/host-tools.md` if the action names below don't match your host's tools. Read `<shared>/principles.md` (applied to every fix) and `<shared>/memory-schema.md` -> issues.md and decisions.md before writing memory.
3. Load project memory per `<shared>/context-loading.md`: `project-overview.md`, `tech-stack.md`, `issues.md` (the bug may be known), and `test-strategy.md` (test conventions). Load `api-patterns.md` for endpoint bugs and `db-schema.md` for data bugs. If memory is missing, do not stop: find the manifest and test runner yourself and suggest `backend-scan` in the report.
4. If the detected stack matches a file in `<shared>/stacks/`, read it.

## References

- `references/triage-playbook.md`: read when localizing a cause by symptom (500s, timeouts, wrong data, flaky tests, memory leaks, deadlocks, race conditions), and for bisect and temporary-logging rules.
- `references/performance.md`: read when the bug is "slow", a latency or throughput regression, high CPU or memory, or a suspected N+1 query.

## mode=auto

Follow the shared `mode=auto` contract in `<shared>/tool-rules.md`. This skill adds only these pauses:

- The bug cannot be reproduced (Step 2 exit).
- Reproducing or inspecting data needs a target that is not provably local.
- Two or more root causes fit the evidence and lead to different fixes.
- The fix changes a public contract (status code, response shape, event payload) or needs a schema change.
- An existing test's expectation looks wrong (Test Integrity: show the diff and ask).
- `git bisect` or any other command that writes refs or moves `HEAD`.

## Workflow

### Step 1: Capture the report

Write down, from the user's message, memory and logs they shared:

1. Expected behavior and actual behavior, in one line each.
2. The exact error output: message, stack trace, status code, request ID.
3. Environment: local, CI, staging or production; runtime and dependency versions if relevant.
4. Since when: first seen, last known good version or commit, recent deploys or merges.
5. Scope: every request or some; one user, tenant or input; always or intermittent.

Ask once, in a single message, only for what is missing and needed to reproduce. Check `issues.md` for a matching open entry.

Output: a short bug statement. Done when expected vs actual and at least one concrete trigger are known.

### Step 2: Reproduce

Find the smallest command, request or test input that shows the bug.

- Prefer, in order: an existing failing test, a new focused test, a local request (`curl` against `localhost`), a small script.
- Run against local targets only. Before running the app or an integration test, resolve every database, queue, cache and external target per `<shared>/tool-rules.md` -> Production Targets, and run the Target Check from `backend-test`.
- Never reproduce against production or shared data without asking. This includes read-only queries: they can expose PII and add load. Never copy production PII into tests, fixtures, logs or memory; build synthetic data with the same shape.
- Respect Command Time Budgets. A run that does not complete is "did not complete", not "no bug".
- If reproducing needs a new file (a test or a script), start the checkpoint first (command in Step 5) and record the file.

Production incident: start with read-only triage of what the user shares (logs, metrics, traces, recent deploys, error tracker exports). Running a command that reaches a production or shared target yourself (for example `kubectl logs`, a cloud logging CLI, a query against a production database or APM API) is Always Ask First even when it only reads: show the command and target, and redact secrets and PII from anything you quote. Mitigation (rollback, restart, scale, feature-flag flip, config change, data fix) is Always Ask First; propose it with the exact command and expected effect, and point to `docs/runbooks/` from `backend-ops`. Then reproduce the cause locally.

If you cannot reproduce after a reasonable effort: stop. Report what you tried, the ranked hypotheses with evidence for each, and what information would settle it. Offer temporary diagnostic logging as a separate, approved step. Do not ship a speculative fix as "fixed".

Output: the reproduction command and its observed output. Done when the bug shows up on demand, or the run has stopped with hypotheses.

### Step 3: Write a failing test

Capture the bug as a test before changing code.

- Follow the project's test conventions (`test-strategy.md`, existing tests near the code) and `backend-test` for framework, fixtures and mocking. Use the lowest level that shows the bug: unit if the logic is local, integration if SQL or a constraint matters, contract if the HTTP mapping is wrong.
- Name it after the behavior, not the ticket: `returns 404 when order belongs to another tenant`.
- Run it and confirm it fails for the right reason (the assertion that describes the bug, not a setup error).
- Test Integrity applies: never weaken, skip or delete an existing test. If an existing test asserts the buggy behavior, show the expectation diff and ask before changing it.
- If the bug cannot be captured in an automated test (for example a timing issue in a third-party system), say why and keep the manual reproduction from Step 2 as the check.

Start the checkpoint before writing the test, if Step 2 has not already started it (see Step 5 for the command), and record the test file.

Before any fix, run the existing suite once (Target Check and Command Time Budgets apply) and save the list of failing tests as the baseline. Step 6 compares against it; without a baseline, report new-failure checks as "not verified".

Output: the new test path and its failing output. Done when the test fails on current code for the reason in the bug statement.

### Step 4: Find the root cause

Localize the fault, then explain it. Use `references/triage-playbook.md` for symptom-specific checks.

- Read the stack trace from the top frame in project code, not the framework frames. Read each function on the path.
- Trace the data: inspect the actual shape of inputs, rows and payloads at each boundary (types, nulls, encodings, time zones, units).
- Search for the symptom's source: the error message string, the status code mapping, callers of the failing function (LSP references if available; otherwise search file contents and confirm each hit).
- History: `git log -p` and `git blame` on the suspect lines are read-only and run without asking. `git bisect start/good/bad/run` moves `HEAD` and writes refs: Always Ask First, require a clean tree, and finish with `git bisect reset`.
- Temporary logging: allowed, recorded in the checkpoint, tagged with a removable marker, never logging secrets or PII (rules in the playbook).
- Debuggers and REPLs on local processes are fine.

State the root cause in this form before fixing anything:

```markdown
Root cause: [one sentence: what is wrong and where, file:line]
Evidence: [stack frame, log line, data sample, bisect result, failing assertion]
Why it produces the symptom: [the causal chain]
Why it was not caught: [missing test, missing validation, untested path]
```

Distinguish the root cause from the trigger. "Null customer crashes the handler" is a trigger; "the repository returns orders whose customer was soft-deleted" is a cause.

Output: the root-cause statement. Done when the evidence explains every observed symptom, or the run has paused because several causes still fit.

### Step 5: Apply the minimal fix

Start a checkpoint before the first edit: `node <shared>/scripts/checkpoint.js start --skill backend-debug --feature <slug>` (slug from the bug, e.g. `fix-order-404-tenant`). Before editing a file listed in the checkpoint's `pre_existing_changes[]` (already dirty before this run), run `checkpoint.js backup --skill backend-debug --feature <slug> <file>`. Record each file you create or edit (`checkpoint.js record`), snapshot after each step, and close it when done. Exit code 3 means an open checkpoint exists: offer resume or restart. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.

- Fix the root cause, not the symptom. Do not swallow the exception, add a blind null check, or widen a `catch` to make the error disappear.
- Change as little as possible. No renames, reformatting of untouched code, dependency bumps or opportunistic cleanup. Note cleanups for `backend-refactor`.
- Search for the same faulty pattern elsewhere. Fix other occurrences only when they are the same bug in the same flow; list the rest in `issues.md`.
- Apply the stack rules in `<shared>/stacks/` and `<shared>/principles.md` to the changed lines.
- A fix that needs a dependency upgrade, a schema change, a public contract change or CI/secret edits stops for confirmation or hands off (see Handoffs).

Output: the diff of the fix. Done when only files tied to the bug and its test changed.

### Step 6: Verify

1. Run the new test: it must pass.
2. Run the rest of the suite within Command Time Budgets and the Target Check. Compare against the pre-fix results: no test that passed before may fail now. Pre-existing failures are reported, not fixed in this run.
3. Run lint and type-check (or LSP diagnostics if available) on changed files.
4. Re-run the Step 2 reproduction: the symptom must be gone.
5. Remove every temporary log and debug statement: search for the marker and confirm zero hits.
6. If the fix fails twice for the same reason, stop and report instead of looping.

Output: test and check results, each marked passed, failed or did not complete. Done when the failing test passes, the suite has no new failures, and no debug code remains.

### Step 7: Record in memory

Follow `<shared>/memory-schema.md` and record each memory write in the checkpoint (`--memory`).

- `issues.md`: add an entry, or update the matching one, with Status `Resolved`, the root cause, the fix location, the regression test path, and the date. Log unrelated problems found on the way as new `Open` entries.
- `decisions.md`: only if the fix made a decision others must follow (for example "money is stored as integer cents", "timestamps are UTC at the boundary").
- `test-strategy.md`: only if the fix added a test convention (owner `backend-test`; append, do not rewrite).

Never write secrets, tokens or production PII into memory.

Close the checkpoint: `node <shared>/scripts/checkpoint.js close --skill backend-debug --feature <slug> --status completed`.

### Step 8: Report

```markdown
## Debug Summary

- Bug: [expected vs actual]
- Reproduction: [command or request]
- Root cause: [one sentence, file:line] — Evidence: [short]
- Fix: [what changed and why it is minimal]
- Regression test: [path] — failing before, passing after
- Suite: [passed / N pre-existing failures / did not complete: reason]
- Files changed: [list; tests marked]
- Existing tests modified: [file -> reason and user approval, or "none"]
- Memory: [issues.md entry, decisions.md if any]
- Follow-ups: [handoffs, similar risks logged in issues.md]
```

## Handoffs

- **Schema change needed** (missing constraint, wrong column type, index for a slow query): stop at the code side. Write the failing test and the root cause, then hand the change to `backend-migrate`. This skill never writes or applies migrations.
- **Auth or authorization bug**: follow `backend-auth` rules (JWT verification, CSRF, tenant-scoped authorization, credential handling). Never fix an auth bug by removing or loosening a check. If the bug is exploitable, mark it High or Critical in `issues.md` and suggest `backend-security` for a wider review.
- **Performance regression**: follow `references/performance.md`. Caching, pooling and queue changes go to `backend-ops`.
- **Production incident**: read-only triage here; mitigation is Always Ask First; runbooks and resilience changes go to `backend-ops`; deploy or rollback goes to `backend-deploy` with confirmation.
- **Missing feature disguised as a bug**: `backend-implement`.
- **Messy code around the fix**: `backend-refactor`, after this run, in a separate change set.

## Undo

To undo this run's changes, use `node <shared>/scripts/checkpoint.js rollback --skill backend-debug --feature <slug> --dry-run`, show the result, then run it without `--dry-run`. Restoring backups (`--restore-backups`) and deleting created files (`--delete-created`) need the user's confirmation. Never use `git checkout --`, `git reset --hard` or `git clean`.

## Done When

- The test that captured the bug failed before the fix and passes after it.
- The suite has no new failures, and every check that did not run is reported as such.
- The root cause is written down with evidence, in the report and in `issues.md`.
- No temporary logging remains and no unrelated changes are in the diff.
- The checkpoint is closed.
