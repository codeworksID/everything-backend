# Memory Updates and Report Template

Read this in Step 7. The schema for `test-strategy.md` is defined in `<shared>/memory-schema.md` -> test-strategy.md; this file shows how backend-test fills it. If the two disagree, the shared schema wins.

## test-strategy.md

backend-test owns this file and creates it on its first run that learns the project's test setup. `backend-debug` may append regression-test notes.

Rules:

- Append a timestamped entry (`## [YYYY-MM-DD HH:MM] <reason>`); keep the latest full entry as the current state and update `## Last Updated`.
- Record facts you observed or commands you ran, with their source (file path or command). Mark anything not verified as `unknown`.
- Change the coverage target only on an explicit user request, and record who asked and why. Measuring coverage does not change the target.
- Record a flaky or pre-existing failing test under Flaky Tests with a link to its `issues.md` entry. Listing a test there is never a reason to skip it.
- No secrets: env var names only, never values or connection strings with passwords.

Template (a new file starts with a `# Test Strategy` heading line, then the first entry):

```markdown
## [YYYY-MM-DD HH:MM] <Initial Test Strategy | Update: reason>

### Runners
- Unit: `<command>` (<runner>)
- Integration: `<command>` (<runner>; needs Target Check)
- Contract / e2e: `<command>`
- Single test: `<command pattern>`

### Layout
- Unit: `<glob>`; Integration: `<glob>`; Contract: `<glob>`
- Naming: <convention>

### Test Database
<Testcontainers | compose test profile | temp SQLite | none>, <how it starts and stops>, <why it is provably local>
Isolation: <transaction rollback | truncate | per-worker database | serial>

### Coverage Target
- Target: <metric and threshold, e.g. unit line coverage >= 80% on src/domain and src/services> (set by <user or default>, <date>)
- Command: `<coverage command>`; scope: <included paths>; excluded: <paths>
- Latest measured: <value> on <date> (<commit if known>), or "not measured: <reason>"

### Fixtures and Factories
- <factory location and helpers, seed files and what they mean>

### Mocking Conventions
- <what is faked at which boundary; HTTP mock tool; clock and ID injection>

### Flaky Tests
- <test id>: <symptom, failure rate> (issues.md: <entry title>)

### CI
- <which suites run in CI, timeouts, services used>

## Last Updated
YYYY-MM-DDTHH:MM:SSZ
```

## issues.md entries

Add an `issues.md` entry (format in `<shared>/memory-schema.md` -> issues.md) for:

- an implementation bug a test exposed, handed to `backend-debug` (Severity by impact; Recommendation names the failing test);
- a pre-existing failing test the run did not cause;
- a flaky test whose cause was not found.

Check for an existing entry on the same test or location first and update it instead of duplicating.

## Test Work Summary

Report at the end of every run. Fill each field from what actually happened; never pre-fill success.

```markdown
## Test Work Summary

- Intent: <run | write | repair | coverage | bootstrap | reproduce | matrix>; feature: <slug>
- Targets checked: <resolved DB/queue/external targets and verdict, or "unit-only, hermetic">
- Commands run: `<command>` -> exit <code>, <passed>/<failed>/<skipped> (<duration>)
- Full suite: <passed | failed: N | did not complete: reason | not run: reason>
- Pre-existing failures: <list with issues.md entries, or "none">
- Files created: <list>
- Files modified: <list>
- Tests added: unit <N> / integration <N> / contract <N>
- Existing tests modified: <file -> reason and user approval, or "none">
- Failures handed off: <test -> backend-debug | backend-implement, with evidence, or "none">
- Handed-over matrix: <row -> pass | fail | n/a, or "none">
- Coverage: <before> -> <after> (<metric, command>), or "not measured: reason"
- Memory updated: <test-strategy.md, issues.md, or "none">
- Not run / did not complete: <suite -> reason, e.g. non-local DATABASE_URL, time budget, no Docker>
```

Then offer, only where relevant:

- "Should I add tests for <uncovered module or branch>?"
- "Should I install <coverage tool> so coverage can be measured?" (Always Ask First)
- "Should I set the coverage target to <value> in test-strategy.md?"
