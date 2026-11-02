# Memory Entry Formats and Output Templates

Read this in backend-scan Steps 4 and 5. `<shared>/memory-schema.md` is the source of truth for required sections; these templates follow it. Replace every bracketed placeholder. A placeholder left in a written file is a verify failure.

## Inventory Entry (project-overview, tech-stack, api-patterns, db-schema)

```markdown
## [YYYY-MM-DD HH:MM] [Initial Scan | Sync Update]

Source SHA: [git rev-parse HEAD, or "no git"]

### Added/Updated
- [What changed, with the value]
- Source: [file path, file:line where practical]

### Deprecated
- [DEPRECATED] [item] - no longer found in code (last seen: [source])

### Unknown
- [fact] - unknown; [owning skill] can determine it
```

Omit the Deprecated and Unknown subsections when empty. Then refresh the file's `## Last Updated`.

## Decision Entry (decisions.md)

One entry per decision, using the decisions.md schema:

```markdown
## [YYYY-MM-DD HH:MM] [Decision Title]

### Context
[What in the code shows this decision. Source: file path]

### Decision
[What was chosen]

### Consequences
- [Known trade-off, or "Not assessed by scan"]

### Status
Proposed
Inferred by backend-scan from code; confirm with the team.
```

If an ADR file exists for the decision, link it and copy its status instead of inferring.

## Issue Entry (issues.md)

One aggregated entry per module, using the issues.md schema. Check for an existing entry on the same module first and update its count instead of adding a duplicate.

```markdown
## [YYYY-MM-DD HH:MM] [N] TODO/FIXME markers in [module]

### Severity
Low

### Description
[N] TODO/FIXME/HACK markers found by backend-scan. Not triaged.

### Location
- [file:line]
- [file:line]
- ([N - samples] more)

### Status
Open
```

## Discovery Summary (scope=initial)

Fill every status from what actually happened. Allowed statuses: created, updated, up to date, partial (name missing sections), failed (give reason). Do not copy a status from this template.

```markdown
# Project Discovery Summary

## Project
- Path scanned: [path; service name if monorepo]
- Type: [Web API / Microservice / Monolith / Worker / CLI / unknown]
- Architecture: [pattern or "undetermined"]

## Tech Stack
- Language: [detected or unknown]
- Package manager: [detected or unknown]
- Framework: [detected or unknown]
- Database: [detected or unknown]
- ORM / migrations: [detected or unknown]
- Tests: [detected or unknown]

## Key Findings
- [Observation, with source; no severity]

## Memory Files
| File | Status | Notes |
|---|---|---|
| project-overview.md | [status] | [missing sections / unknowns] |
| tech-stack.md | [status] | |
| api-patterns.md | [status] | |
| db-schema.md | [status] | |
| decisions.md | [status] | [N inferred, Proposed] |
| issues.md | [status] | [N aggregated TODO issues] |

## Unknowns
- [fact] - [skill that can resolve it]

## Coverage
- Sampled: [what was read in full vs sampled]
- Skipped: [excluded or generated folders]
- Git staleness check: [ran / skipped: reason]

## Suggested Next Step
[e.g. backend-doctor for a health check, or resolve the listed conflicts]
```

## Change Summary (scope=sync)

```markdown
# Memory Sync Summary

- Date: [ISO timestamp]
- Project: [name / path]
- Source SHA: [sha or "no git"]

## Changes
### Added
- [NEW] [item] -> [memory file] (source: [path])

### Modified
- [MODIFIED] [item]: [old] -> [new] (source: [path])

### No longer in code
- [DEPRECATED] [item] -> [memory file]

### Planned, not yet implemented
- [item] (written by [design skill]; left unchanged)

## Conflicts (not applied)
- [None, or: memory says X, code says Y, source; question for the user]

## Memory Files
| File | Status | Notes |
|---|---|---|
| [file] | [created / updated / up to date / partial / failed] | |

## Coverage
- Git staleness check: [ran / skipped: reason]
- Compaction: [none / archived N entries to archive/...]
```
