# Baseline and Verification

How to lock a test baseline (SKILL.md Step 1), what behavior to lock beyond the tests (Step 2), and how to compare at the end (Step 7).

`<run-dir>` below is this run's artifact folder: `.opencode/everything-backend-memory/.checkpoints/<id>/`, where `<id>` is the checkpoint id printed by `checkpoint.js start` (also shown by `checkpoint.js status --json`). Create the folder if it does not exist. It lives in the skills' memory folder, which is excluded from the clean-tree check and should be gitignored.

## Detecting a Real Test Suite

A config file alone (e.g. `pyproject.toml`, `go.mod`) does not prove tests exist. Find actual test files:

| Stack | Test file patterns |
|---|---|
| JS / TS | `*.test.*`, `*.spec.*`, files under `__tests__/` |
| Python | `test_*.py`, `*_test.py` |
| Go | `*_test.go` |
| Java / Kotlin | `*Test.java`, `*Tests.java`, `*IT.java`, `*Test.kt`, `*Tests.kt` under `src/test/` |
| Other | the runner config plus files in `test/`, `tests/`, or `spec/` |

Then the baseline run must report more than zero executed tests. A run that collects zero tests is "no suite", not a green baseline.

## Running the Baseline

Run the whole suite with a machine-readable per-test report and record the runner's own exit code. Let the runner write the report file. Do not pipe through `tee`: `cmd | tee file` returns `tee`'s exit code and hides a red suite.

```bash
# bash: no pipe, so $? is the runner's exit code
npx jest --json --outputFile=<run-dir>/baseline.json; echo "exit=$?"
npx vitest run --reporter=junit --outputFile=<run-dir>/baseline.xml; echo "exit=$?"
pytest --junitxml=<run-dir>/baseline.xml; echo "exit=$?"
go test -json ./... > <run-dir>/baseline.jsonl; echo "exit=$?"
# Maven/Gradle: run the normal test goal, then copy target/surefire-reports/*.xml
# or build/test-results/test/*.xml into <run-dir>/
```

Notes:

- Use the project's own test script when it wraps the runner, passing the reporter flags through (e.g. `npm test -- --json --outputFile=...` when the script calls Jest directly). Read the script body first (see `tool-rules.md` -> Runs Without Asking).
- If a pipe is unavoidable in bash, run `set -o pipefail` first.
- PowerShell: read `$LASTEXITCODE` on the line right after the command. Run `go test -json` under bash, or as `cmd /c "go test -json ./... > <run-dir>\baseline.jsonl"` (cmd writes the bytes unchanged and `$LASTEXITCODE` is go's exit code).
- Never use `>` for patch or report files in Windows PowerShell 5.1: it writes UTF-16LE, which `git apply` and JSON parsers reject. Write patches with `git diff --output=<file>` or `checkpoint.js snapshot`, never with a shell redirect.
- Time limits: `tool-rules.md` -> Command Time Budgets. A run that does not complete is "not verified", never a green baseline.
- Target Check: unless the command provably runs only hermetic unit tests, resolve every database, queue, and external target per `tool-rules.md` -> Production Targets before running, and ask first if a test hook migrates, resets, or seeds a database.

## Normalizing

Convert the report into `<run-dir>/baseline-results.json`: a sorted list of `{ "id": "...", "status": "passed|failed|skipped" }`, where the id is file + suite + test name. Drop durations, timestamps, seeds, and log output. This list, not a hash of raw output, is the baseline.

Characterization tests are added before the baseline is locked (SKILL.md Step 1). After adding them, re-run and re-normalize: they appear as new `passed` entries. This is the only point where the baseline may be updated. Never re-baseline on half-refactored code.

## Characterization Tests

Write them when the code path being refactored has no tests inside an otherwise working suite:

- Exercise the existing behavior through its public interface.
- Assert on current outputs, status codes, error types, and side effects, even when the current behavior looks wrong. If it looks like a bug, note it for `issues.md`; do not "fix" the expectation.
- Name them clearly: `Characterization: <module> produces <behavior>`.
- For large or opaque outputs, a golden-master (approval) test works: record the current output for a fixed set of inputs, then compare. Strip nondeterministic fields (ids, timestamps) first.
- Keep characterization tests at least until Step 7 passes. Replacing them with cleaner behavioral tests is a follow-up after the refactor is verified (`backend-test`).

If the project has no test suite at all, do not write one here: hand off to `backend-test`.

## Implicit-Contract Checklist (Step 2)

Tests often miss these. List the ones that apply in the behavior lock and check them in Step 7:

- **Public contracts**: function signatures, HTTP routes, request/response shapes, status codes, error types and messages that clients parse, CLI output, event names and payloads.
- **Side-effect order**: writes, emitted events, emails, and external calls happen in the same order and the same number of times.
- **Transaction scope**: work that committed atomically still commits atomically. Moving a method out of a class can bypass framework proxies: e.g. Spring `@Transactional` or `@Async` does not apply to a self-invocation, and Python or TS decorators may not follow an extracted function. Check that transaction, retry, cache, and auth annotations still wrap the code they wrapped before.
- **DI and wiring**: the app still boots and every injected dependency resolves (component scan paths, module registration, provider lists). For API-facing code, boot the app or run contract or integration tests.
- **Query count and performance**: an extraction can introduce N+1 queries or extra round trips. Where a hot path is touched, compare query counts (ORM query logging or a test that counts queries) before and after.
- **Query safety**: for every query that moves or is rewritten (into a repository, a helper, or a new ORM or query-builder API), values stay bound parameters, identifiers (sort, column, table) still come from a server-side allowlist, and every owner predicate (`tenant_id`, `user_id`) is still bound from the authenticated principal, never from the request. `WHERE id = $1` alone is not equivalent to `WHERE id = $1 AND tenant_id = $2`. Rules: `_shared/sql-safety.md` -> The Rules. In Step 7, run its Verification steps 1-2 on the changed files.
- **Observability names**: log messages that alerts match on, metric names and labels, and trace span names are contracts for dashboards and alerts.
- **Concurrency and state**: globals, singletons, module-level caches, and initialization order. Capture them in characterization tests before extracting.
- **Serialization**: field names, null vs. missing fields, date and decimal formats.

## Comparing in Step 7

Re-run the suite exactly as in the baseline and normalize. Compare per test against `<run-dir>/baseline-results.json`:

- Every baseline `passed` test must still be `passed`. A test that is now `failed`, `skipped`, or missing is a regression.
- If a test id changed only because the refactor moved or renamed its file or suite, map old id to new id explicitly in the summary.
- Tests retired with a confirmed module deletion (Retired tests rule, SKILL.md Step 5) are listed as such. Any other missing test is a regression.
- New tests (characterization tests added during the run) must pass.
- Timings, ordering, and log output are ignored.

Also:

- Check diagnostics on every changed file (LSP diagnostics if available; otherwise the project's type-check or compile command). Zero new errors.
- Find references to every old location or symbol: zero dangling references.
- No new `any` types, suppressed errors, disabled lint rules, or lint violations.
- If API-facing code changed, run contract tests or call a representative endpoint on a provably local instance.
- Go through the implicit-contract items listed in Step 2.
- If data-access code changed: `_shared/sql-safety.md` -> Verification steps 1-2 on the changed files (static search for string-built SQL and unsafe raw APIs, then read every changed repository/DAO file, because multi-line query building escapes line-based searches). Put each moved query next to its original and confirm the placeholders, allowlist and owner predicate match. A query the refactor made unsafe is a regression; one that was unsafe before goes to `backend-debug` (SKILL.md Step 5, Unsafe queries found).
