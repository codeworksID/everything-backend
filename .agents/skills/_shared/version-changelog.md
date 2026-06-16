# Version Changelog

> Tracks structural changes to the `.agents/skills` suite.
> Not a project changelog. Only documents skill-doc boundaries, shared prerequisites, and cross-skill consistency fixes.

---

## Unreleased (2026-06-16)

### Added

- **backend-refactor skill** (`backend-refactor/SKILL.md`): behavior-preserving backend refactoring workflow — characterization tests first, behavior lock, LSP-led reference discovery, incremental refactor patterns (split controller/service, extract module, dependency inversion, strangler fig, modernize legacy), and verification via diagnostics/tests. Reuses the shared checkpoint/rollback contract from `_shared/tool-rules.md` and is routed via `backend-orchestrator`.
- **Shared prerequisites/context doc** (`_shared/context-loading.md`): centralized skill prerequisites and context-loading guidance so individual SKILL.md files don't duplicate setup instructions.
- **Cross-platform prerequisite guidance**: consolidated notes for Windows, macOS, and Linux tooling expectations.

### Fixed

- **backend-visualize routing**: updated `backend-orchestrator` so diagram requests route to the right skill.
- **backend-visualize prerequisite cleanup**: removed the irrelevant `_shared/principles.md`/Security prerequisite from the diagram skill.
- **backend-ops context consistency**: aligned observability/caching/async skill doc with shared context expectations.
- **Checkpoint block deduplication**: removed repeated checkpoint boilerplate that appeared in multiple skill files.
- **Step-number cleanup**: normalized `backend-api-design` to use `Step 1.5` for tool-assisted discovery and `Step 1.6` for API principles.
- **deploy section transition fix**: smoothed awkward handoff between deploy steps that jumped out of order.

### Future

- Boundary and versioning follow-ups: decide whether shared docs get semver tags or rolling dates.
- Evaluate splitting `_shared/principles.md` if it grows past ~120 lines.
- Consider a lightweight test (lint or schema check) that flags drift between SKILL.md prerequisites and `_shared` state.

---

## v0.1.0 (initial)

- First pass at `.agents/skills` directory structure.
- Individual SKILL.md files for: backend-orchestrator, backend-scan, backend-implement, backend-test, backend-deploy, backend-ops, backend-auth, backend-db-design, backend-api-design, backend-architect, backend-migrate, backend-visualize, backend-doctor.
- `_shared/` directory with tool-rules, memory-schema, and principles stubs.
