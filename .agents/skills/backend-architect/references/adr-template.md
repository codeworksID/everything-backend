# ADR Template and decisions.md Summary

Read this when writing an ADR, numbering it, superseding one, or adding the decisions.md summary (Step 7).

## Which Record Holds What

- **ADR file** (`docs/adr/NNNN-<slug>.md`): the full, human-facing record. It lives in the repository and is never compacted.
- **decisions.md entry**: a short summary in the memory-schema format that points to the ADR file. Skills load it as context. Compaction rules in memory-schema.md apply to it; Accepted and Proposed decisions are never archived.

Write one ADR per significant decision: pattern, language/framework, primary database, API protocol, tenancy model, and each brownfield phase boundary or service extraction. Small choices (a library for one module) go in the overview, not in an ADR.

## Numbering and Location

1. If the project already keeps ADRs (look for `docs/adr/`, `doc/adr/`, `docs/decisions/`, `adr/`), use that folder and its naming style.
2. Otherwise use `docs/adr/`.
3. List the folder. Take the highest numeric prefix and add 1. Pad to four digits. The first ADR is `0001`.
4. Slug: lowercase words joined by hyphens, e.g. `0003-use-postgresql.md`.
5. Never reuse or renumber an existing ADR.

## ADR Template

```markdown
# ADR-NNNN: [Title]

- **Status**: [Proposed / Accepted / Superseded by ADR-NNNN / Deprecated]
- **Date**: [YYYY-MM-DD]
- **Deciders**: [user or team; "backend-architect (mode=auto)" for Proposed]
- **Supersedes**: [ADR-NNNN, or none]

## Context
[The problem, the requirements and constraints that matter, and the forces in tension. Cite targets from the overview.]

## Decision
[What was chosen, stated in one or two sentences, then the specifics.]

## Consequences
- Positive: [what becomes easier]
- Negative: [what becomes harder, and the cost]
- Follow-up: [work this creates, with the owner skill]

## Alternatives Considered
- [Alternative 1]: [why not chosen]
- [Alternative 2]: [why not chosen]

## Revisit When
[Triggers that would reopen this decision, e.g. "a second team owns billing", "p95 above 300 ms at current scale".]
```

## Superseding an ADR

1. Write the new ADR with `Supersedes: ADR-NNNN`.
2. In the old ADR, change only the status line to `Superseded by ADR-MMMM` and add the date. Do not edit its other sections.
3. In decisions.md, apply the memory-schema supersede rule: set the old entry's status to Deprecated and add `Superseded by: [YYYY-MM-DD] [New Title]` under its `### Status`.

## decisions.md Summary

Append one entry per ADR, using the `## [YYYY-MM-DD HH:MM] [Title]` heading and sections from memory-schema.md. Keep it short; the ADR holds the detail.

```markdown
## [2026-11-02 10:00] ADR-0002: Use a modular monolith

### Context
Two-person team, three business capabilities, 50 req/s peak. Full record: docs/adr/0002-use-modular-monolith.md

### Decision
Single deployable with users, orders and billing modules; modules own their tables and talk through service interfaces.

### Consequences
- Simple deploys and debugging
- Module rules must be enforced in review and tests

### Status
Accepted
```

Then update `## Last Updated` in decisions.md. If decisions.md does not exist yet, create it with the `# Decisions` heading first.
