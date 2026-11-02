# Summary and Memory Updates

Templates for SKILL.md Step 8. Memory files follow `memory-schema.md`: append timestamped entries, never overwrite a file.

## Summary Template

```markdown
## Refactor Summary: <slug>

**Pattern**: <pattern from patterns.md>
**Scope**: <modules / files in scope>
**Result**: verified | rolled back | stopped at step <N> (reason)

### Structural changes
- <old location or shape> -> <new location or shape>

### Files
- Modified: <list>
- Created: <list>
- Deleted (confirmed): <list>

### Tests
- Baseline: <passed> passed, <failed> failed, <skipped> skipped
- After: <passed> passed, <failed> failed, <skipped> skipped
- Added (characterization): <list>
- Moved or renamed (old id -> new id): <list>
- Retired with <module> (confirmed): <list>
- Test files modified, with reason: <list>

### Implicit contracts checked
- <item from the Step 2 list>: <how checked, result>

### Checks not run or not completed
- <check>: <reason>

### Follow-ups
- Bugs found (logged in issues.md, for backend-debug): <list or none>
- Characterization tests to replace with behavioral tests (backend-test): <list or none>
- Strangler migration still in progress: <yes/no, remaining callers>
```

Report checks that did not run as "did not complete" or "not run", never as passed (`tool-rules.md` -> Error Handling).

## project-overview.md

When module boundaries or the directory layout changed, append:

```markdown
## [YYYY-MM-DD HH:MM] Refactor: <slug>

### Structure
- `src/orders/` — order workflow (split from `src/services/order-service.ts`)

### Module Boundaries
- Orders: owns checkout and order history (notifications moved to Notifications)
- Notifications: owns order emails and push messages
```

Mark directories or modules that were removed as deprecated or removed. Update `## Last Updated`.

## decisions.md

Append an entry when the refactor applies an architectural pattern choice (e.g. introducing a repository layer, ports-and-adapters, splitting a module along a new boundary, or starting a strangler migration):

```markdown
## [YYYY-MM-DD HH:MM] Split OrderService into Orders and Notifications

### Context
OrderService mixed checkout logic and notification delivery; it was hard to test.

### Decision
Extract notification delivery into a Notifications module behind a NotificationPort.

### Consequences
- Checkout tests run without an email provider
- One more module to wire in the composition root

### Status
Accepted
```

Plain renames and small extractions need no decision entry.

## issues.md

Log anything the refactor found but must not fix:

```markdown
## [YYYY-MM-DD] Discount applied twice for bundled items

### Severity
Medium

### Description
Found during refactor <slug>. Characterization test `Characterization: pricing applies bundle discount` captures the current (double) discount.

### Location
src/pricing/bundle.ts

### Status
Open

### Recommendation
Fix with backend-debug; update the characterization test as part of that fix.
```

Creating an issue in an external tracker (GitHub, Jira, Linear) sends data outside the project: ask first.

## Other memory files

- `api-patterns.md`: update only if import paths or handler locations recorded there changed. The HTTP contract itself must not change in a refactor.
- `db-schema.md`: a refactor does not change the schema. If it seems to need a schema change, stop and hand off to `backend-migrate`.
- Record each memory file you changed with `checkpoint.js record --memory <file>`.
