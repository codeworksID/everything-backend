---
name: backend-security
description: "Reviews backend security and reports findings with evidence. Builds a threat model (assets, entry points, trust boundaries, STRIDE), checks every OWASP API Security Top 10 (2023) item with concrete code searches, scans the working tree and git history for secrets, audits dependencies, licenses and the supply chain (SBOM, image scans, lockfiles, CI action pinning), runs SAST, and reviews CORS, headers, TLS, cookies, debug modes, error leakage and PII handling. Writes docs/security/review-YYYYMMDD.md and logs open findings in issues.md. Read-only by default: fixes are handed to backend-auth, backend-implement or backend-debug. Use when the user says 'security review', 'threat model', 'OWASP', 'pentest prep', 'audit security', 'secrets scan', 'leaked keys', 'SBOM', 'vulnerability', 'CVE in my dependencies', 'is this secure', or wants a pre-launch security check of a service, a diff or a feature. Not for designing auth (backend-auth) or a general health check (backend-doctor)."
---

# Backend Security

Find real, evidenced security problems and say who should fix them. This skill reports and proposes fixes. It does not change source code unless the user explicitly asks it to.

## When to Use

- The user asks for a security review, threat model, OWASP check, pentest prep or "is this secure?".
- A service, feature or diff is about to launch or be exposed to third parties.
- The user wants a secrets scan, a dependency/CVE audit, an SBOM or a supply-chain check.
- `backend-doctor` or another skill routes a security question here.

Not for:
- Designing or changing authentication, sessions, JWT handling, authorization or tenant isolation: `backend-auth` (this skill reviews them and hands fixes there).
- Execution-based health checks (build, tests, lint, smoke start): `backend-doctor`.
- Fixing a specific known bug: `backend-debug`. Building a new control (rate limiter, audit log): `backend-implement`.
- Resilience, rate-limit infrastructure, backups and DR: `backend-ops`. Pipeline hardening changes: `backend-deploy`.

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs, e.g. Claude.ai), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, checkpoints, Command Time Budgets, dependency audit rules) and `<shared>/host-tools.md` if the action names below don't match your host's tools. Read `<shared>/principles.md` -> Security. Read `<shared>/memory-schema.md` -> issues.md before writing findings.
3. Load project memory per `<shared>/context-loading.md`: `project-overview.md`, `tech-stack.md`, `api-patterns.md` (endpoint inventory, auth method), `db-schema.md` (where PII lives), `decisions.md`, `deployment.md` if present, and `issues.md` (known findings, to avoid duplicates). If memory is missing, continue from the code and say so in the report; suggest `backend-scan` afterwards.
4. If the detected stack matches a file in `<shared>/stacks/`, read it.

## Safety Rules

- **Read-only by default.** The only files this skill writes are the review report, optional SBOM output, and memory. Source, config, CI and secret files are not edited unless the user asks this skill to fix something (see Fix Mode).
- **Never print a secret value.** Report secrets as `file:line` plus type only (for example `src/config.ts:12 AWS access key`). Redact scanner output before showing it. Never paste a secret into the report, memory, a URL or a chat message.
- **Never verify a secret against its provider.** Live verification sends the secret to a third party. Use scanner options that turn it off.
- **Installing a scanner is Always Ask First** (`<shared>/tool-rules.md`), including `npx`, `pipx run`, `go run` and `docker run` of a tool image that is not already present. If a tool is missing, do the manual checks and list the tool under "Not run".
- **Do not send source code to a hosted scanner or SaaS** (scanner logins, cloud upload modes) without asking.
- **No active testing against non-local targets.** No exploit attempts, fuzzing or load against staging or production. Requests are allowed only against a local instance this run started, under `<shared>/tool-rules.md` -> Production Targets.
- **Budgets.** Scanners follow Command Time Budgets. A scan that does not finish is "did not complete", never "pass".

## Workflow

### Step 1: Scope

Confirm one scope and the depth:

- **Service**: the whole repository or one deployable.
- **Diff**: changed files only. Get them with `git diff --name-only <base>...HEAD` (ask for the base if unclear; default to the main branch), plus `git diff --name-only HEAD` and `git ls-files --others --exclude-standard` for uncommitted and untracked changes.
- **Feature**: the routes, handlers, models and jobs of one feature.

List the entry points in scope: HTTP routes, GraphQL/gRPC operations, webhooks, queue consumers, scheduled jobs, CLI commands, file uploads. Use the `api-patterns.md` inventory and confirm it by searching route definitions in the code.

Output: scope statement, entry-point list, and an open question list (asked once, in one message, only when the answer changes the review: for example "is this API public or internal?").

### Step 2: Threat model

Fill the template in `references/threat-model.md`:

1. Assets: data and capabilities worth protecting (credentials, PII, payments, tenant data, admin actions, secrets, availability).
2. Actors: anonymous user, authenticated user, other tenant, admin, internal service, third-party webhook sender.
3. Trust boundaries and data flow: client -> API, API -> DB, API -> third-party APIs, queues, admin plane.
4. STRIDE table per boundary or entry point, with existing controls and gaps.

For a diff or small feature, a short table covering only the touched flows is enough.

Output: the threat model section of the report, and a list of high-risk flows that Step 3 must examine first.

### Step 3: OWASP API Security Top 10 (2023)

Work through every item in `references/owasp-api-top10.md`: run its searches, read each hit in context, and record a verdict.

| ID | Item |
|---|---|
| API1 | Broken Object Level Authorization (BOLA/IDOR) |
| API2 | Broken Authentication |
| API3 | Broken Object Property Level Authorization (mass assignment, excessive data exposure) |
| API4 | Unrestricted Resource Consumption |
| API5 | Broken Function Level Authorization (BFLA) |
| API6 | Unrestricted Access to Sensitive Business Flows |
| API7 | Server-Side Request Forgery (SSRF) |
| API8 | Security Misconfiguration (detailed in Step 7) |
| API9 | Improper Inventory Management |
| API10 | Unsafe Consumption of APIs |

Also run the "Beyond the Top 10" checks in the same reference (injection, unsafe deserialization, path traversal, uploads, crypto misuse, webhook signatures, open redirects).

Rules:
- A search hit is a lead, not a finding. Read the handler and its middleware before calling it a finding.
- Each item gets one verdict: **pass** (with what was checked), **finding** (with IDs), or **not applicable** (with a reason, e.g. "no outbound HTTP calls with user input").
- When coverage is partial (large codebase, sampled routes), say what was covered.

Output: a verdict table with ten rows and the findings behind it.

### Step 4: Secrets

Follow `references/secrets-and-supply-chain.md` -> Secrets:

1. Check tracked files that should never be committed (`git ls-files` for `.env*`, keys, credential files) and that `.gitignore` covers them.
2. Scan the working tree and the git history with `gitleaks` or `trufflehog` if installed, with redaction on and verification off.
3. Without a scanner, run the redacted pattern search and the history search from the reference.

A secret in history is still leaked even if it was deleted later: the fix is rotation first, history rewrite optional and only with the user.

Output: a list of `file:line` (or `commit:file`) and secret type, with status "working tree" or "history only".

### Step 5: Dependencies and supply chain

Follow `references/secrets-and-supply-chain.md` -> Dependencies, SBOM, Images, Pinning and Licenses:

1. Vulnerability audit with the stack's tool, in the read-only mode allowed by `<shared>/tool-rules.md` (`npm audit` without `fix`, `pip-audit` on the installed environment, `govulncheck ./...`, and so on). Report direct vs transitive, severity and the fixed version.
2. SBOM with `syft` if available (CycloneDX JSON).
3. Container image and filesystem scan with `trivy` or `grype` if available, on a locally built image only.
4. Lockfiles committed and used (`npm ci`, `--frozen-lockfile`, hashes), base images pinned, no `latest`, no `curl | sh` in Dockerfiles or CI.
5. CI: third-party actions pinned to a full commit SHA, least-privilege `permissions:`, no secrets exposed to untrusted pull requests, dependency update bot present.
6. Licenses: flag copyleft (GPL, AGPL) and unknown licenses in a proprietary service. This is a compliance flag, not legal advice.

Output: dependency findings table, SBOM path (or "not generated"), pinning and CI findings, license flags.

### Step 6: SAST

Run `semgrep` if installed, with metrics off and the project's own config if it has one (commands and exclusions in `references/config-and-privacy.md` -> Static Analysis (SAST) Notes). Use stack tools already present (`bandit` with virtualenv and build folders excluded, `gosec`, `eslint` security plugins, `spotbugs`). Discard hits outside the project's source roots. Triage each remaining hit by reading the code: true positive -> finding, false positive -> note it once.

Output: triaged SAST findings, and the tools that ran or did not run.

### Step 7: Configuration review

Check each area in `references/config-and-privacy.md` -> Configuration: CORS, security headers, TLS and certificate verification, cookie flags, debug modes and exposed docs/admin consoles, error leakage, logging of secrets and PII, request size limits, container user and ports. Read the production config path, not only the dev defaults.

Output: config findings, which also decide the API8 verdict.

### Step 8: Privacy basics

Follow `references/config-and-privacy.md` -> Privacy: build a PII inventory from `db-schema.md` and the models, then check retention, erasure, export, encryption of sensitive fields, PII sent to third parties and PII in logs. This is an engineering check, not a legal opinion.

Output: PII inventory table and privacy findings.

### Step 9: Write the report and log findings

1. Start a checkpoint before the first write to the project (the report, or an SBOM the user asked to keep, whichever comes first): `node <shared>/scripts/checkpoint.js start --skill backend-security --feature <slug>` (slug from the scope, e.g. `review-orders-api`). Record each file you create or edit (`checkpoint.js record --created ...` or `--modified ...`, and `--memory issues.md` for memory), snapshot after each step, and close it when done. On exit code 3, offer to resume or restart. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.
2. Write `docs/security/review-<YYYYMMDD>.md` from `references/report-template.md`. If the file exists for today, add a suffix (`-2`). Every finding has an ID (`SEC-001`...), severity per the rubric in the template, OWASP mapping, evidence as `file:line`, impact, proposed fix, and owner skill.
3. Append each open Critical, High and Medium finding to `issues.md` in the `<shared>/memory-schema.md` format, with `### Owner` set to the owner skill and a link to the report. Before appending, search `issues.md` for the same location and type; update an existing open entry instead of duplicating it. Never write secret values into memory.
4. Close the checkpoint (`checkpoint.js close --skill backend-security --feature <slug>`).

Output: the report file and the updated `issues.md`.

### Step 10: Report and hand off

Summarize in chat: scope, counts by severity, the Top 10 verdict table, the top findings with `file:line`, what did not run, and the report path. Then route fixes:

| Finding area | Owner |
|---|---|
| Authentication, sessions, JWT, CSRF, authorization rules, tenant isolation | `backend-auth` |
| Defect in existing code (missing ownership check, injection, SSRF guard, leaked field) | `backend-debug` (fix plus regression test) |
| New control or capability (rate limiting, validation layer, audit logging) | `backend-implement` |
| API contract (field allowlists, limits, removed or versioned endpoints) | `backend-api-design` |
| Schema, encryption columns, retention jobs, row-level security | `backend-db-design`, then `backend-migrate` |
| CI pinning, image scanning, SBOM and signing in the pipeline | `backend-deploy` |
| Rate-limit infrastructure, WAF, backups and DR | `backend-ops` |
| Negative tests for each fixed finding | `backend-test` |

Secrets in the working tree or history: tell the user to rotate them first. Rotation, history rewrites and force pushes are the user's call and are Always Ask First.

## Fix Mode (only when asked)

If the user asks this skill to fix findings:

1. Confirm which finding IDs are in scope. Auth, session and authorization fixes still go to `backend-auth` unless the user insists.
2. Start a new checkpoint for the fixes (the review checkpoint is already closed): `checkpoint.js start --skill backend-security --feature <slug>-fixes`. Run `checkpoint.js backup` for any file that was already dirty before you edit it, `record --modified` each file, and `snapshot` after each fix. Close it when done.
3. Make the smallest fix per finding. Add or request a negative test that fails before and passes after (`backend-test` conventions; Test Integrity applies).
4. Re-run the search or scan that produced the finding to confirm it is gone. Set the finding status in the report and `issues.md` to Resolved, noting "fixed in working tree, pending review".
5. Editing CI/CD config, secret files or dependency versions stays Always Ask First.

## Output

- `docs/security/review-<YYYYMMDD>.md`.
- New or updated `issues.md` entries for open Critical, High and Medium findings.
- Optional SBOM file (path stated in the report).
- A chat summary with the verdict table, top findings, "Not run" list and handoffs.

Done when:
- Every OWASP API Top 10 item has a verdict: pass (with what was checked), finding (with IDs), or not applicable (with a reason).
- Every finding has evidence (`file:line`, commit, config key or command output), a severity, a proposed fix and an owner skill.
- Secrets, dependencies, SAST and config each show a result or a "Not run" entry with the reason and the exact command for the user.
- No secret value appears in the report, memory or chat.
- The report exists, open findings are in `issues.md`, and the checkpoint is closed.

## Edge Cases

- **No shell, or only some files available (e.g. Claude.ai with uploaded files)**: do the code-reading parts (Steps 1-3, 7, 8) on what is available; list every scan as "did not run" with the command to run.
- **Huge codebase**: prioritize the high-risk flows from Step 2, all write endpoints and all `/{id}` routes; state the sampling.
- **Monorepo**: review one service at a time; shared libraries are reviewed once and referenced.
- **Generated code or vendored code**: exclude from SAST and searches; note the exclusion.
- **Internal-only API**: still review. "Internal" is a trust assumption to write in the threat model, not a pass.
- **Findings already in `issues.md`**: reference the existing entry, update its status if it changed, do not duplicate.
- **User asks for a pentest**: explain that this skill does a white-box review and pentest prep; active testing of shared environments is out of scope.

## References

- `references/threat-model.md`: read in Step 2 for the asset, actor, boundary and STRIDE templates and common threats per entry-point type.
- `references/owasp-api-top10.md`: read in Step 3 for the searches, what to read, pass criteria and fixes per Top 10 item, plus the Beyond the Top 10 checks.
- `references/secrets-and-supply-chain.md`: read in Steps 4-5 for scanner commands, the redacted manual secret search, audit commands per stack, SBOM, image scans, pinning, CI and license checks.
- `references/config-and-privacy.md`: read in Steps 6-8 for SAST commands and exclusions, the configuration checklist with per-stack searches, and the PII inventory and privacy checks.
- `references/report-template.md`: read in Step 9 for the report layout, severity rubric, finding format and the `issues.md` entry format.
