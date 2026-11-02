---
name: backend-orchestrator
description: Routes backend requests to the right everything-backend skill and runs multi-skill pipelines (new feature, greenfield project, schema change, bug fix, refactor, security review, production readiness, memory refresh) with gates between steps. Use when a backend request spans several steps, when it is unclear which backend skill applies, or for broad asks such as "build a backend", "help with my backend", "add a feature end to end", "build this from scratch", "change the schema and ship it", "fix this bug and make sure it stays fixed", "is this ready for production", or "what should I do next on this service". Not for requests that clearly name one skill; activate that skill directly.
---

# Backend Orchestrator

Pick the right skill for a backend request, or chain several skills into a gated pipeline. The orchestrator itself writes no code or files. The routed skills do the work, own their memory updates, and run their own checkpoints.

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Always Ask First, checkpoints) and `<shared>/host-tools.md` if the actions below do not map cleanly to your host's tools.
3. Check project state per `<shared>/context-loading.md`: is there a backend project, and does `.opencode/everything-backend-memory/` exist and look fresh? Missing or stale memory on an existing project means the pipeline starts with `backend-scan`. No project at all means Greenfield.
4. If the detected stack matches a file in `<shared>/stacks/`, note it; the routed skills read it.

## Skills and What They Own

Each skill has exactly one owner role. Route by the owner, not by keyword overlap.

| Skill | Owns | Typical phrases |
|-------|------|-----------------|
| `backend-scan` | Learning an existing project; creating and syncing memory | explore, understand, what's here, scan, refresh memory |
| `backend-architect` | Architecture, stack choice, ADRs (`docs/architecture/overview.md`, `docs/adr/`) | design the architecture, pick a stack, monolith or microservices |
| `backend-visualize` | Mermaid diagrams: ERD, class, actor, flowchart, sequence, architecture | draw an ERD, diagram this, show the flow |
| `backend-db-design` | Target schema design (no migration files) | design tables, model this data, indexes |
| `backend-migrate` | Writing and applying migrations, backfills, expand/contract | add a column, migration, backfill, rename a table |
| `backend-api-design` | Endpoint contracts, OpenAPI, GraphQL, gRPC | design endpoints, API contract, versioning |
| `backend-auth` | Authentication and authorization design and code | login, JWT, sessions, roles, permissions |
| `backend-implement` | Building new features and endpoints | implement, build, add endpoint, write the code |
| `backend-refactor` | Behavior-preserving restructuring | refactor, split, extract, decouple, modernize |
| `backend-test` | Test strategy and test code | write tests, coverage, test plan |
| `backend-debug` | Bug triage and fixing: reproduce, failing test, root cause, minimal fix, regression test | bug, error, 500, broken, failing, regression, why is X slow |
| `backend-security` | Threat model, OWASP API Top 10 review, secret scan, SAST, supply chain, SBOM (read-only by default) | security review, threat model, OWASP, pentest prep, secrets scan, SBOM |
| `backend-doctor` | Execution-based health check: build, lint, tests, dependency audit, code review | health check, run doctor, review my code, what's wrong |
| `backend-ops` | Observability, caching, queues, config, resilience patterns, backup/restore/DR, runbooks | logging, metrics, alerts, retries, circuit breaker, backups, DR |
| `backend-deploy` | Containers, CI/CD, release strategy, migration step in the pipeline, rollback, post-deploy checks | deploy, Docker, Kubernetes, CI/CD, rollout, rollback |

## Routing Procedure

1. **Classify the request.**
   - *Review-only*: the user asks to review, audit, assess, check, or "is it ready". Pass `review-only` to every routed skill (defined in `<shared>/tool-rules.md` -> mode=auto Contract): report findings and write no source, config, CI, or infrastructure files. Report files and memory entries that are a review skill's stated output (for example `docs/security/review-<YYYYMMDD>.md`, `issues.md`) are allowed; if the user said "don't write anything", skip those too.
   - *Change*: the user wants something built, fixed, or changed.
2. **Match intents** against the table above and the precedence rules below.
   - One match: route to that skill.
   - Several matches that form a known chain: run the matching workflow (see Workflows).
   - Several matches with no workflow: run them in sequence in dependency order (design -> migrate -> implement -> test -> review -> diagram -> deploy). Each step starts only when the previous step's exit criteria are met.
   - No match: ask one clarifying question that offers the two or three closest routes. If the request is outside backend work, say so and stop.
3. **Announce the route** before starting, in one or two lines: the skill or workflow, the feature slug, the run mode, and the steps. The user can correct it.
4. **Invoke each skill by name** with your host's skill mechanism (load its `SKILL.md`, or delegate to a subagent if your host supports it). Pass:
   - `mode`: `auto` by default, `interactive` if the user asked to confirm steps (see `<shared>/tool-rules.md` -> mode=auto Contract);
   - `feature=<slug>`: a short kebab-case name for the work (for example `user-registration`), the same slug for every step, so checkpoints line up;
   - `review-only` when step 1 set it;
   - for `backend-scan`: `scope=initial` or `scope=sync`.
5. **Hand off between steps** with a short summary of the previous step's output (files, decisions, open issues). Do not restate memory contents; each skill loads its own context.

### Precedence Rules

- Something is broken, failing, erroring, regressed, or slow -> `backend-debug` first. Never route bug fixing to `backend-implement` or `backend-refactor`.
- Performance ("why is X slow", p95 up): `backend-debug` reproduces and finds the cause; then `backend-ops` for caching, pooling, or queue changes, and `backend-doctor` for a performance review of the code.
- Security review, threat model, OWASP, pentest prep, secrets scan, SBOM, dependency vulnerabilities -> `backend-security`, not `backend-doctor`. Security fixes then go to `backend-auth` (authn/authz), `backend-debug` (a defect in existing code), `backend-implement` (a new control) or `backend-deploy` (pipeline and image hardening).
- New behavior -> `backend-implement`. Same behavior, new structure -> `backend-refactor`. If a request mixes both, refactor first (with a passing test baseline), then implement.
- Any schema change -> `backend-db-design` for the target schema, then `backend-migrate` for the files. Only `backend-migrate` writes or applies migrations.
- API shape not yet designed -> `backend-api-design` before `backend-implement`.
- "Deploy" with pending migrations -> `backend-deploy` runs them as a gated pipeline step (expand -> deploy -> contract); authoring goes to `backend-migrate`.
- Diagrams describe the final state: run `backend-visualize` after the change it depicts.
- "Migrate" meaning a framework or language move (for example "migrate to Spring Boot 3") is an upgrade, not `backend-migrate`.

### Requests No Skill Fully Owns Yet

| Request | What to do |
|---------|-----------|
| Production incident ("prod is down", outage) | Say there is no incident-response skill. Ask what the user has already done. Use `backend-debug` for root cause on code they can run locally, and the runbooks from `backend-ops` (`docs/runbooks/`). Never deploy, roll back, or touch production without explicit confirmation. |
| Dependency or framework upgrade | Say there is no upgrade skill. Run `backend-test` to secure a passing baseline, then `backend-refactor` for code changes; installs and upgrades are Always Ask First. Use `backend-security` if the trigger is a vulnerability. |
| Load testing against an SLO | Say no skill owns load testing. Record it as an open item in the readiness report. |

## Workflows

Step-by-step details, outputs, and branches are in `references/workflows.md`. Pick one by the first matching row.

| Workflow | Use when | Chain |
|----------|----------|-------|
| Greenfield | No project exists yet ("from scratch") | architect -> db-design -> migrate -> api-design -> auth -> implement -> test -> security -> ops -> deploy -> doctor |
| Bug Fix | Something is broken, failing, or slow | debug -> test -> doctor |
| Schema Change | A table, column, index, or constraint changes on an existing DB | db-design -> migrate -> implement -> test -> deploy |
| New Feature | Significant feature on an existing backend | [scan] -> db-design -> [migrate] -> api-design -> [auth] -> implement -> test -> doctor |
| Quick Add Endpoint | Small endpoint, stack and schema already known | api-design -> implement -> test -> [security or auth if sensitive] |
| Refactor | Restructure without behavior change, optionally then document | test baseline -> refactor -> doctor -> [scan sync -> visualize] |
| Security Review | Security review, threat model, pentest prep | security -> [auth, debug or implement fixes, approved] -> test -> security re-check |
| Production Readiness | Before launch, "is it ready" | security -> ops -> deploy -> doctor, ending in the readiness checklist |
| Memory Refresh | Memory may be out of date | scan (scope=sync) -> [doctor, only if asked] |

Brackets mean conditional. Add `backend-visualize` at the end of any workflow when the user asks for diagrams.

## Gates and Loops

These rules apply to every workflow. They are stated once here; `references/workflows.md` only adds workflow-specific branches.

- **Always Ask First stays in force.** Applying migrations, deploys, git ref writes, dependency installs, CI/CD and secret edits, and non-local targets need confirmation in every mode (`<shared>/tool-rules.md` -> Always Ask First, Production Targets). The orchestrator never batches these approvals across steps.
- **Severity gates** (from `backend-doctor`, `backend-security`, or `backend-test`):
  - Critical: stop the pipeline. Report the finding and the owning skill, and wait for the user's approval before any fix. After the fix, re-run the step that found it.
  - High: present it and ask the user to choose fix now, accept the risk, or stop. Continue only on an explicit answer.
  - Medium and Low: make sure they are logged in `issues.md` and continue.
- **Loop-backs**: a design gap found later returns to the owning design step (`backend-api-design`, `backend-db-design`, `backend-auth`) with the specific gap. A schema change found mid-implementation goes `backend-db-design` -> `backend-migrate` -> resume `backend-implement`.
- **Iteration cap**: any loop (implement <-> test, fix <-> re-check, design <-> implement) runs at most 3 times. After the third failed pass, stop and report what was tried, the current failure, and the options.
- **Test integrity**: a failing test is fixed in the code by the owning skill (`backend-debug` for bugs, `backend-implement` for new features), never by weakening the test (`<shared>/tool-rules.md` -> Test Integrity).
- **Interruptions**: if a step stops mid-way, tell the user which step and slug; re-invoking the same skill with the same slug offers to resume from its checkpoint.

## Output

At the end of a workflow, report:

1. The route taken and each step's result (done, skipped and why, or stopped).
2. Files created or changed, by step, as reported by the routed skills.
3. Findings by severity, with what was fixed, accepted, or left open.
4. Actions still waiting on the user (approvals, contract migrations, open readiness items).

Done when every step in the chosen workflow met its exit criteria or was explicitly skipped by the user, no Critical finding is open, every High finding is fixed or accepted by the user, and the report above is delivered.

## References

- `references/workflows.md`: read when running any multi-step workflow, for each step's output, branches, and exit criteria.
