---
name: everything-backend
description: Complete backend engineering toolkit with 16 sub-skills that work as one system. Use for any backend task - scanning an existing codebase, architecture and stack choice, database schema design, migrations and backfills, API design, authentication and authorization, implementing features, refactoring, writing tests, debugging and fixing bugs, security review (OWASP, SQL injection, secrets, dependencies), health checks and code review, observability, caching, queues, resilience, backups and disaster recovery, Docker, CI/CD, Kubernetes and deployment, and Mermaid diagrams. Triggers include build a backend, add an endpoint, design the database, write a migration, fix this bug, review security, is this production-ready, deploy this, and draw an ERD.
---

# everything-backend (Claude.ai bundle, v{{VERSION}})

This one skill contains the whole everything-backend pack. The sub-skills depend on each other (shared rules, handoffs and cross-references), so the bundle is only valid **complete**: all {{SKILL_COUNT}} sub-skills plus `skills/_shared/`.

## Step 0: Verify the Bundle (every session, before anything else)

Do this once per conversation, before reading any sub-skill or answering the request.

1. Run `python3 <this skill's folder>/verify.py` (or `node <this skill's folder>/verify.js`). Both check every file, including this `SKILL.md`, against `MANIFEST.json` (path and SHA-256, line endings ignored).
   - Exit 0 and a line starting `OK:` means the bundle is complete. `WARN:` lines name unknown extra files or folders: do not read or route to them.
   - Exit 1 or a line starting `INCOMPLETE:` means the bundle is missing or has changed files.
2. If you cannot run code, list `skills/` in this skill's folder instead. It must contain `_shared/` and every one of these folders, each with a `SKILL.md`:
{{SKILL_LIST}}
3. If the check fails or any listed folder is missing, **stop**. Do not read the sub-skills and do not answer the backend request from them or from memory. Tell the user: "The everything-backend skill is incomplete (<what the check reported>). All {{SKILL_COUNT}} sub-skills must be installed together. Re-download the full `everything-backend.zip` (or run `npm run build:claude`), remove the current upload and any separate `backend-*` skills in Settings > Capabilities > Skills, and upload the zip again as one skill."

## Step 1: Route the Request

Pick the sub-skill by owner, then read its `skills/<name>/SKILL.md` **in full** and follow it exactly, including its "Before You Start" block.

| Sub-skill | Owns |
|---|---|
| `backend-orchestrator` | Unclear or multi-step requests; pipelines such as new feature, schema change, bug fix, production readiness |
| `backend-scan` | Learning an existing project; creating and syncing memory |
| `backend-architect` | Architecture, stack choice, ADRs |
| `backend-visualize` | Mermaid diagrams |
| `backend-db-design` | Target schema design (no migration files) |
| `backend-migrate` | Writing and applying migrations, backfills, expand/contract |
| `backend-api-design` | Endpoint contracts, OpenAPI, GraphQL, gRPC |
| `backend-auth` | Authentication and authorization |
| `backend-implement` | Building new features and endpoints |
| `backend-refactor` | Behavior-preserving restructuring |
| `backend-test` | Test strategy and test code |
| `backend-debug` | Bugs: reproduce, failing test, root cause, fix, regression test |
| `backend-security` | Threat model, OWASP API Top 10, injection, secrets, SAST, supply chain |
| `backend-doctor` | Health check: build, lint, tests, audit, code review |
| `backend-ops` | Observability, caching, queues, config, resilience, backup/restore/DR |
| `backend-deploy` | Containers, CI/CD, Kubernetes, release, rollback |

When the request spans several of these, or none clearly fits, start with `skills/backend-orchestrator/SKILL.md`.

## Paths Inside This Bundle

- `<shared>` in every sub-skill means `skills/_shared/` (each sub-skill finds it as `../_shared/` next to its own folder).
- A cross-skill path such as `backend-migrate/references/zero-downtime.md` is relative to `skills/`.
- Project memory and deliverables are written in the user's project, not in this bundle (see `skills/_shared/memory-schema.md`).

## Rules That Always Apply

- `skills/_shared/tool-rules.md` (mode=auto contract, Always Ask First, Production Targets, Test Integrity) overrides anything else.
- `skills/_shared/sql-safety.md` applies to every query the sub-skills write or review: bound parameters only, allowlisted identifiers, owner predicates on tenant/user rows, and negative tests with hostile input.
- `skills/_shared/secure-coding.md` (S1-S18) applies to all other code they write or review: no mass assignment, no shell or `eval`, contained paths, SSRF-safe outbound calls, safe parsers, vetted crypto, no secrets in code or logs, bounded resources, verified webhooks. Before reporting code as done, run `node skills/_shared/scripts/security-scan.js <files>` when code execution is available, and fix every critical or high finding.
- In Claude.ai there is no LSP and no subagents; follow `skills/_shared/host-tools.md` -> Claude.ai for the fallbacks.
