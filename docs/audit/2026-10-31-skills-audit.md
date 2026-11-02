# everything-backend skills audit

*2026-10-31 · audited commit `13ae867` (package.json version 0.3.0)*

## Scope and method

The audit covered all 14 skills in `.agents/skills/`, the 5 shared docs in `_shared/`, `package.json`, the 5 READMEs, the `.github/` templates and the git history. That is about 5,500 lines.

Fourteen independent auditors read the material, each from one angle:

- **7 deep reads, one per pair of related skills:** orchestrator+scan, architect+visualize, db-design+migrate, api-design+auth, implement+refactor, test+doctor, ops+deploy.
- **5 cross-cutting reviews:** cross-skill consistency; packaging and distribution; coverage gaps; authoring quality; technical accuracy and agent safety.
- **2 scenario dry-runs.** These walked an agent through 7 realistic requests, following the skills step by step:
  - a greenfield multi-tenant Go SaaS
  - a Stripe webhook in Express+Prisma
  - a zero-downtime column rename
  - a p95 latency regression
  - a FastAPI security review
  - a Spring Boot 2.7→3 upgrade
  - a 3,000-line service split plus an ERD

Those passes produced 539 raw findings, which merged into 286. An independent verifier then tried to refute each one. Every critical and high finding also got a second skeptic. A completeness critic added 17 more, and each of those was verified too.

**Result: 296 confirmed findings, 3 disputed, 4 refuted.** Of the confirmed findings, 139 were accepted only after the verifier corrected their scope or severity, and the corrected version is what this report uses. I settled the 3 disputes and one contradiction between verifiers by hand; see the last section.

| Severity | Count | | Kind | Count |
|---|---|---|---|---|
| Critical | 1 | | Defect (something present is wrong) | 130 |
| High | 24 | | Gap (something missing) | 141 |
| Medium | 179 | | Enhancement | 25 |
| Low | 92 | | | |

Finding IDs (F001…, C001…) link each statement here to its full evidence in [2026-10-31-findings-detail.md](2026-10-31-findings-detail.md). All findings are also in [2026-10-31-findings.json](2026-10-31-findings.json), which you can use to file issues.

## Verdict

The structure is sound:

- The skills are split clearly by concern.
- Shared contracts cover memory files, `mode=auto`, checkpoints and rollback.
- One principles doc applies to every skill.
- The orchestrator has explicit severity and branching rules.
- The migration skill knows about expand/contract.
- There are multilingual READMEs and contribution templates.

That is more design than most skill packs have.

The suite is not yet reliable to hand to an agent. There are four systemic problems, plus a long list of missing capabilities.

1. **It can't be installed from the repo.** Commit `8c9d5b6` deleted `scripts/install.js`, but `package.json` still uses it for `bin`, `files` and `postinstall`. The READMEs and PR template still tell people to run it (F001). npm 0.3.0 still works only because that tarball was built before the deletion. The next `npm publish` breaks `npx everything-backend` for everyone.
2. **The safety model is too permissive for an autonomous agent.**
   - `mode=auto` is the default even when the skill is invoked directly. It pauses only for operations the agent itself classifies as destructive, and there is no rule for deciding whether a database or target is production (F002).
   - Tests and the app run against whatever `.env` points at (F042), and `backend-implement` writes migrations and suggests applying them without going through `backend-migrate` (F043, F010).
   - The shared rollback recipe `git checkout -- <file>` throws away the user's own edits (F046). Refactor reverts to the "last known-good commit" with no clean-tree or branch policy (F045).
   - `backend-test` tells the agent to "update invalid tests… re-run until green", which lets it weaken failing tests (F053).
   - Secrets can end up in memory files and reports (F015, F052), and memory and repo text are loaded as trusted instructions (F096).
3. **The shared contracts exist on paper but the skills don't honor them.**
   - `_shared/` is looked up at a project-relative path, which doesn't exist after a global install. "REQUIRED" checks then hard-stop (F018).
   - The keep-last-5 compaction rule archives the baseline inventory, open issues and accepted decisions (F014).
   - The feature-slug checkpoint rule contradicts itself, and no skill passes a slug (F017).
   - Skills that the orchestrator says write memory never do: architect (F020), auth (F031), doctor (F051) and ops (F097).
   - The orchestrator says "re-run from step 5" in workflows that have only 3 steps and 2 steps (F008).
   - A 30-second blanket timeout kills test suites, builds and migrations (F049).
4. **Technical guidance is wrong in the places an agent copies word for word.**
   - **Migrations:**
     - The worked rename example drops the old column with no dual-write, so writes made after the backfill are lost (F003).
     - The "safer" NOT NULL sequence still locks the table (F022).
     - There is no `lock_timeout` guidance (F023).
     - `CREATE INDEX CONCURRENTLY` inside a transaction is mishandled (F024).
   - **JWT:** no verification rules: no alg pinning, no iss/aud/exp checks, no JWKS (F033).
   - **Multi-tenancy:** the auth ownership example allows cross-tenant access (F029).
   - **Implement snippets:** they persist the raw DTO, including the plaintext password (F048).
   - **Docker, compose and CI templates:** the compose stack won't start, GHCR push fails, and GitLab can't log in (F062, F064, F194, F196, F197).
   - **Mermaid templates:** they don't render as written (F108–F111).

## Fix first (P0)

These are mostly small edits. Do them before anything else, because they cause broken installs, data loss or unsafe agent behavior.

| # | Fix | Findings | Effort |
|---|---|---|---|
| 1 | Restore `scripts/install.js` from `94548bf`, or fix `bin`/`files`/`postinstall` and the docs together. Add a prepublish check that every path in `bin`/`files` exists. | F001, F073 | S |
| 2 | Add `backend-refactor` to all 5 READMEs and the issue/PR templates. Fix the "Repository layout" and "What gets installed" sections. | F171, F220 | XS |
| 3 | Fix the orchestrator's "re-run from step 5" loop-back targets. | F008 | XS |
| 4 | Look up `_shared/` relative to the skill's own install directory, not the project. Make a missing shared doc a warning, not a hard stop. | F018 | S |
| 5 | Replace the `git checkout -- <file>` rollback with a diff/patch-based undo that keeps user edits. Require a clean tree or a dedicated branch before refactors that can revert. | F046, F045 | S |
| 6 | Drop the blanket 30 s timeout; use per-command-class budgets instead. | F049 | XS |
| 7 | Rewrite the `mode=auto` contract as an allowlist. Read-only and hermetic local commands run on their own. Migrations, env-targeted runs, git ref writes, deletes, installs and deploys need confirmation. Any target that isn't provably local counts as production. Add a rule never to weaken or skip a failing test. | F002, F042, F053, F084 | M |
| 8 | Fix the migration guidance: dual-write in the rename example, batched backfill plus `NOT VALID` CHECK for NOT NULL, `lock_timeout`/`statement_timeout`, `CONCURRENTLY` outside transactions, and carrying constraints and indexes over on a rename. | F003, F022, F023, F024, F027 | M |
| 9 | Make `backend-migrate` the only path that writes or applies migrations. `db-design` designs them, and `implement` hands off. | F010, F043, F026 | S |
| 10 | Make compaction keep pinned sections (inventory, open issues, accepted decisions) and archive only history. | F014 | S |
| 11 | Add security fixes: JWT verification rules, tenant-scoped ownership checks, CSRF/session hardening for cookie auth, and snippets that hash before persisting and whitelist fields. | F033, F029, F035, F048 | M |
| 12 | Make the post-generation checklist greps actually scan, match the right code, and give an exit criterion that can be met. | F041 | S |

## What is lacking

### Skills that don't exist yet

The scenario dry-runs showed that the orchestrator has nowhere to route several common requests (F006). For "find out why p95 doubled", "security review before launch", "upgrade Spring Boot 2.7→3" and "fix this bug", the agent either fell into `backend-doctor`'s generic health check or got stuck. These are the highest-value additions:

| Proposed skill | What it would own | Findings |
|---|---|---|
| `backend-debug` | Bug triage: reproduce, write a failing test, fix the root cause, add a regression test. Today no skill owns bug fixing. Refactor redirects to implement, which has no bug workflow. | F040, F006 |
| `backend-security` | Threat modeling, an OWASP API Top 10 review (BOLA, mass assignment, SSRF, resource limits), secret scanning including git history, SAST, supply-chain checks (SBOM, image scan, pinning), license compliance, and privacy/compliance (retention, erasure, DSAR, field encryption). | F054, F147, F184, F200, C011, F227 |
| `backend-perf` | Profiling, query plans (with a warning that `EXPLAIN ANALYZE` executes the query), N+1 detection, load testing, capacity planning and before/after measurement. | F055, C010 |
| `backend-reliability` | SLOs and alerting, runbooks, incident response, postmortems, backup/restore drills and DR, plus resilience patterns (timeouts, retries with budgets, circuit breakers, bulkheads). | F065, F068, F066 |
| `backend-upgrade` | Framework, runtime and dependency major upgrades: release-notes diff, codemods, deprecation sweeps, staged verification. Several templates already pin end-of-life or outdated versions (Node 20, `docker:24`, OpenAPI 3.0, `safety check`). | F071, F061 |
| `backend-integrations` | Inbound and outbound webhooks (raw-body signature check, dedup, retries, SSRF), payments and money movement, idempotency-key implementation, outbound API clients, and transactional notifications. | F037, F036, F232, F286, F168 |
| `backend-ai` | LLM feature backends: RAG pipelines, vector stores, an LLM gateway (keys, rate limits, cost, fallbacks), prompt and PII guardrails, evals. Nothing covers this, despite 2026 demand. | F070 |
| `backend-docs` (or a mode on existing skills) | ADR files, API documentation publishing, SDK/client generation, runbooks and READMEs. | F285, F226 |

There is also a **diff-scoped PR review** mode (F229). It could be a `mode=review` on `backend-doctor` rather than a new skill.

### Existing skills that are too thin

- **backend-deploy** is the weakest skill:
  - no workflow, output paths, validation or exit criteria (F058)
  - Node-only templates, even though it detects Python, Go and Java (F057)
  - Kubernetes and Helm advertised but absent (F060)
  - no release strategy, rollback or post-deploy verification (F063)
  - no migration step in the pipelines (F028)
  - no IaC (F201) and no serverless or PaaS guidance (F202)
- **backend-ops:**
  - nothing on scheduled jobs, outbox relay or sagas (F067)
  - no event-contract design or schema evolution (F231)
  - feature flags get three bullets (F228)
  - the caching and messaging semantics are inaccurate (F210, F211)
  - secrets management is shallow (F199)
- **backend-api-design:**
  - GraphQL and gRPC are claimed, but only REST has working guidance (F034)
  - nothing on versioning and deprecation (F142), rate limiting design (F146), upload security (F148), real-time auth and scaling (F149), optimistic concurrency, long-running operations or bulk endpoints (F145), or HTTP caching semantics (C014)
- **backend-auth:**
  - no OAuth/OIDC client checks, no enterprise SSO/SCIM, no build-vs-buy IdP guidance (F153)
  - Node/TS-only (F154)
  - no verification or negative-test exit criteria (F155)
- **backend-db-design / backend-migrate:**
  - effectively PostgreSQL-only, despite recommending MySQL and MongoDB (F123, F136)
  - no tool-specific migration workflow (Prisma, Alembic, Flyway, golang-migrate…) (F026)
  - no tracking of expand/contract phases across releases and sessions (F126)
  - no backup gate before the contract step (F125)
  - shallow foreign-key guidance (F134), and no domain modeling or state machines (F251)
- **backend-test:**
  - no guidance on testing auth (F176) or async, idempotency and concurrency (F177)
  - no contract testing against the OpenAPI spec (F178)
  - nothing on ephemeral infrastructure or property, fuzz and mutation testing (F179)
  - no coverage commands, though it requires before/after coverage (F174)
- **backend-architect:**
  - no brownfield process, although refactor routes redesigns to it (F103)
  - NFRs not quantified (F102)
  - no microservice-extraction or data-ownership-split workflow (F233)
  - cost is mentioned only in passing (F252)
- **backend-scan:**
  - no actual procedure for extracting tables, endpoints or conventions (F012)
  - monorepos undefined (F085)
  - misses PHP, .NET, Kotlin, Elixir, Deno and Bun (F077)
- **backend-visualize:**
  - no state-machine, C4, deployment or module-dependency diagrams (F114)
  - no render or validation step (F118)
- **Language support is uneven.** Skills claim Node, Python, Go and Java, but Java is mostly absent from implement, test and auth. Nothing exists for .NET, PHP/Laravel, Ruby/Rails, Rust or Kotlin, and deploy hard-stops on them (F069, F167, F175).

### Engineering around the skills

- **No CI, validation or evals** (F074). A small `scripts/` folder plus one GitHub Action would catch most of this audit's mechanical defects. It would check frontmatter, dangling `_shared` and heading references, step numbering and memory-file names, and run Mermaid templates through `mmdc`. Add an eval set of trigger prompts with expected skills and behaviors (F098, F118).
- **Progressive disclosure.** No skill uses `references/`. `backend-visualize` is 722 lines and loads every template on every run (F120). Context-loading boilerplate is copied into most skills, and the copies have drifted (F092).
- **Triggering.**
  - The orchestrator's description has no when-to-use clause (F004).
  - Generic one-word triggers collide across skills: "test", "config", "session", "migration" (F095, F127).
  - Implement and refactor both claim "refactor/split" (F039).
- **Missing deliverables and exit criteria.** Architect, deploy, migrate, db-design, api-design, ops, test and scan don't say what they produce, where they write it, or when they're done (F020, F058, F129, F130, F141, F214, F266, F086).
- **Portability.**
  - Tool names are specific to OpenCode/OMO, with no fallback on the advertised Cursor and Gemini hosts (F050).
  - Many commands are POSIX-only (C007, F206).
  - Checkpoint filenames contain `:`, which Windows forbids (F089).
  - The Cursor install target `~/.cursor/skills-cursor` is Cursor's managed built-ins folder, not the user skills folder (F216).
  - There is no Claude Code target (F218).
- **Release hygiene.**
  - There are no git tags, and published versions were bumped outside git (F072).
  - The changelog is out of sync and claims fixes that aren't present (F222).
  - `--update` doesn't update, and installed copies carry no version marker (F223). The copy installed on this machine at `~/.gemini/config/plugins/everything-backend-plugin` is an example: it is stale, missing `backend-refactor` and `backend-visualize`, and its `plugin.json` has no version.
  - There is no SECURITY.md (F225) and no CONTRIBUTING.md (F276).

## What the scenario dry-runs showed

- **Greenfield Go SaaS:**
  - Shared prerequisites require an existing project root and manifests, which blocks the architect's main use case (F019).
  - The architect never saves its output anywhere (F020).
  - Git is never initialized, but checkpoints, rollback and staleness all depend on it (F273).
  - Multi-tenancy isolation is never designed (F029).
- **Stripe webhook in Express+Prisma:**
  - There is no webhook guidance (F037).
  - Implement's validation check and doctor would flag correct raw-body handling as "missing validation" (F038, low).
  - The Prisma migration bypasses `backend-migrate` and its safety rules (F043).
- **Zero-downtime rename:**
  - Following the worked example as written loses data (F003).
  - The NOT NULL step locks the table (F022).
  - There is no `lock_timeout` (F023).
  - Prisma's rename-as-drop is not flagged (F026).
  - The deploy pipeline has no migration step (F028).
- **p95 regression and security review:**
  - The orchestrator has no route for either (F006).
  - Both fall into doctor's generic health check (F054, F055).
- **Spring Boot 2.7→3:**
  - No upgrade workflow exists (F071).
  - Doctor's Maven audit goal doesn't exist (F181).
  - The bare "migrate" trigger mis-routes the request to DB migrations (F127).
- **3,000-line service split plus ERD:**
  - Implement and refactor compete for the request (F039).
  - The refactor baseline hides failures behind `tee`, and its output hash can never match (F044).
  - The 30 s timeout kills the suite (F049).
  - Visualize can't build an ERD from the memory files (F112).

## Disputes resolved by hand

- **F032** (auth has no gate before rotating keys or changing live auth): **refuted**. Both verifiers agreed that the cited lines describe how the finished application should behave, not actions the agent takes. One small point is real: account-recovery tokens are never required to come from a CSPRNG. That is a low-severity wording fix in `backend-auth`.
- **F038** (validation pushes the agent to body-parse webhooks): **downgraded to low**. The checklist can flag correct raw-body verification as a false positive, but it doesn't tell the agent to change body parsing. The real issue is the missing webhook guidance in F037.
- **F072** (published versions can't be reproduced from git): **downgraded to low**. The tarballs the verifier checked (0.3.0 and 0.2.7) match their `gitHead` commits byte for byte. What remains is hygiene: no git tags, and version bumps that were never committed.
- **C001 vs F217** (the Gemini install target): the verifiers contradicted each other. I checked this machine. `~/.gemini/config/plugins/` is where Antigravity loads plugins: Google's own `android-cli-plugin` and `modern-web-guidance-plugin` sit there with the same `plugin.json` + `skills/` layout. So the location is correct. C001 is **downgraded to low** and kept only for the naming ("Gemini IDE" means Antigravity) and the missing version in `plugin.json`.
- **Refuted outright:** F217 (the Gemini path is wrong), F253 (the WebSocket table and audit-log secrets point were already handled), F268 (the backend-test duplication was trivial) and F272 (the inline-template token share was overstated).

## Appendix: every confirmed finding

One line per finding, grouped by area and sorted by severity. Each one is written out in full (evidence, impact, fix, verifier notes) in [2026-10-31-findings-detail.md](2026-10-31-findings-detail.md).

### Packaging, install & repo docs (23)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F001 | critical | defect | package.json bin/postinstall point to deleted scripts/install.js | package.json:21-32; README.md:74,94-95,124-125 |
| F073 | medium (was high) | defect | Documented manual install and --dry-run are no-ops: the installer skips itself at the repo root | install.js:259-263 (0.3.0); README.md:71-75,94,124; PR template:47 |
| F074 | medium (was high) | gap | No CI, validation, linting or evals for the skills or installer | .github/ (no workflows); package.json:29-33; version-changelog.md:29 |
| F171 | medium | gap | backend-refactor is missing from all READMEs and the issue/PR templates; templates reference the deleted installer | README*.md:12-26,30-49,108-117; feature_request.md:24-39; PR template:23-47 |
| F216 | medium | defect | Cursor install target ~/.cursor/skills-cursor is not a documented skills location | install.js:19-25 (0.3.0); README.md:63 |
| F218 | medium | gap | No Claude Code target, and the README doesn't say ~/.agents/skills serves several hosts | README.md:59-65,98-117 |
| F219 | medium | gap | README doesn't document what the skills write into projects or that auto mode is the default | README.md (whole); tool-rules.md:44-46,57 |
| F220 | medium | defect | README 'What gets installed' and 'Repository layout' don't match reality | README.md:98-104,128-134 |
| F223 | medium | defect | Installer --update doesn't update, and installed skills carry no version marker | install.js:66-80,373-376 (0.3.0); README.md:85-89 |
| F224 | medium | defect | --force recursively deletes destination folders, including generic _shared in a shared dir | install.js:341,369-388 (0.3.0) |
| F225 | medium | gap | Security reporting link leads nowhere: private reporting is disabled and there is no SECURITY.md | .github/ISSUE_TEMPLATE/config.yml:6-8 |
| C001 | low (was high) | defect | README labels the Antigravity plugin target 'Gemini IDE'; Gemini CLI users aren't pointed to ~/.agents/skills | README.md:61-62 (same line 62 in every translation); installer as last committed, git show 55eb14b:scripts/install.js lines 13-17 and 213-220 |
| F221 | low (was medium) | defect | Indonesian README uses Chinese section headings and has a malformed heading | README.id.md:30,51,98,119,128 |
| F222 | low (was medium) | defect | version-changelog is out of sync with releases, claims fixes that aren't present, and ships to users | version-changelog.md:8,20-23,33-37; package.json:3 |
| F275 | low | defect | Issue config links to disabled Discussions; the translation label doesn't exist | config.yml:3-5; translate_readme.md:5 |
| F276 | low | gap | No CONTRIBUTING.md or skill-authoring guide | README.md:6; PR template:18,54 |
| F277 | low | enhancement | postinstall hook adds install-script risk while only printing a message | package.json:30 |
| F278 | low | defect | Installer exits 0 when it skips in non-interactive environments | install.js:281-283,303-305,331-333 (0.3.0) |
| F279 | low | enhancement | package.json metadata describes an Opencode-only tool and has no author | package.json:4,14-20 |
| F280 | low | gap | .gitignore is minimal and there is no .gitattributes | .gitignore:1-2 |
| F281 | low | defect | Windows example path in the translations mixes separators | line 95 of each |
| F282 | low | defect | Translation PR template can't be reached from the GitHub UI | .github/PULL_REQUEST_TEMPLATE/ |
| F283 | low | gap | Installer has no uninstall or cleanup for removed or renamed skills | install.js:36-48,369-390 (0.3.0) |

### Shared contracts (_shared/) (18)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F002 | high (was critical) | defect | mode=auto contract auto-approves migrations, app runs and most irreversible ops | tool-rules.md:11,34-47 |
| F014 | high | defect | Keep-last-5 compaction archives the baseline inventory, open issues and accepted decisions | memory-schema.md:182,222,233-234,305-315; backend-scan/SKILL.md:151 |
| F017 | high | defect | Feature-slug checkpoint keying contradicts itself and no skill propagates a slug | tool-rules.md:57-60; backend-test:258; backend-refactor:277 |
| F046 | high | defect | Shared rollback recipe `git checkout -- <file>` discards user edits and fails for created files | tool-rules.md:57-59 |
| F049 | high | defect | Blanket 30s command timeout kills test suites, builds, audits and migrations | tool-rules.md:11,25; refactor:39-41,78,132; doctor:187 |
| F013 | medium (was high) | defect | Staleness check sees only committed changes, is hard-coded to src/, and compares epoch against tz-less timestamps | context-loading.md:128-144; backend-scan/SKILL.md:114-127,156 |
| F015 | medium (was high) | gap | No rule against writing secrets or PII into memory, archives or checkpoints, and no VCS guidance | memory-schema.md:270,290,305-311; backend-scan/SKILL.md:72-74,100-107 |
| F016 | medium (was high) | gap | test-strategy.md and deployment.md are loaded (priority 6/7) but have no schema and no writer; the coverage target is undefined | context-loading.md:170-171,181; backend-test/SKILL.md:26,254; backend-scan/SKILL.md:100-106; orchestrator:80,103 |
| F019 | medium (was high) | defect | Shared prerequisites block greenfield projects, the architect's headline use case | context-loading.md:11-27,116; architect:3,12,18,46,296; implement:23-24,116 |
| F083 | medium | defect | Missing-memory fallback contradicts itself (suggest scan vs auto-run) across shared docs and skills | context-loading.md:93-96 vs 116,183; architect:46; implement:24 |
| F088 | medium | gap | Checkpoint lifecycle (status, completion, clearing) is undefined | tool-rules.md:57-58; migrate:286 |
| F089 | medium | defect | Checkpoint filenames use ISO timestamps with colons, which Windows forbids | tool-rules.md:57; test:258; refactor:277 |
| F093 | medium | defect | memory-schema required layout and timestamp format contradict its own examples | memory-schema.md:10-14,26-44,182,199,222,240,263 |
| F094 | medium | defect | Memory-writing skills create empty, non-conforming files and never write in schema format | db-design:28; migrate:30,33,271-280; api-design:26,260 |
| F096 | medium | gap | Memory and repo content are auto-loaded as trusted context with no prompt-injection guard | context-loading.md:163-175; memory-schema.md:297-303 |
| C005 | low | defect | Archive filenames can collide, so a later compaction can overwrite earlier archived history | memory-schema.md:307-311 |
| F087 | low (was medium) | gap | Checkpoint contract is missing from scan, ops, deploy and the design skills although they write files and memory | tool-rules.md:53-61 |
| F274 | low | defect | Shared PowerShell snippets fail, and manifest globs descend into dependency folders | context-loading.md:18,32,48,51,56 |

### backend-orchestrator & backend-scan (32)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F010 | high | defect | db-design, migrate and implement all claim migration files; New Feature bypasses migrate's safety rules | orchestrator:16,63,76; db-design:12-13,179-187; migrate:16; implement:193,231-240 |
| C002 | medium | defect | Staleness check misses code that reaches the branch through a merge commit | context-loading.md:128-142; memory-schema.md:276-284; backend-scan/SKILL.md:114-117 |
| C003 | medium | gap | Memory files are merge-conflict-prone and have no locking or merge procedure for teams or parallel sessions | memory-schema.md:14,57,102,143,187,227 (single `## Last Updated`), 234/260-270 (append at end), 305-311 (compaction rewrites); tool-rules.md:57-60; backend-scan/SKILL.md:127,147 |
| C004 | medium | defect | 200 KB memory size guard is far beyond what an agent can load, and scan's compaction never checks size | memory-schema.md:313-315; context-loading.md:175; backend-implement/SKILL.md:34; backend-scan/SKILL.md:149-151 |
| C012 | medium | defect | Security principle says to sanitize input before processing, with no output-encoding rule and no command, log or header injection guidance | principles.md:47; backend-scan/SKILL.md:81; backend-doctor/SKILL.md:155,191; backend-ops/SKILL.md:282-285,334-337 |
| F004 | medium (was high) | defect | Orchestrator description has no when-to-use clause or trigger phrases | backend-orchestrator/SKILL.md:3,10 |
| F005 | medium (was high) | gap | Routing is one sentence: no rules for ambiguous, multi-intent or unmatched requests | backend-orchestrator/SKILL.md:8-10,28-48,52 |
| F006 | medium (was high) | gap | Routing table has no rows for bug/debug, performance, security review, upgrades or incidents | backend-orchestrator/SKILL.md:28-44 |
| F007 | medium (was high) | gap | Production Readiness workflow has no security, load, backup or alerting gate, and review requests can route into it and generate files | backend-orchestrator/SKILL.md:39,105-121 |
| F008 | medium (was high) | defect | Production Readiness and Memory Refresh say 're-run from step 5' but have only 3 and 2 steps | backend-orchestrator/SKILL.md:84,116,120,134 |
| F009 | medium (was high) | gap | No greenfield, schema-change, refactor or refactor-then-diagram workflow; architect, migrate, refactor and visualize appear in no pipeline | backend-orchestrator/SKILL.md:50-135 |
| F011 | medium (was high) | defect | backend-scan redefines mode=auto, and its sync path asks for confirmation, contradicting the contract | backend-scan/SKILL.md:85-94,118,126-127; tool-rules.md:49 |
| F012 | medium (was high) | gap | Scan has no procedure to extract tables, endpoints or API conventions | backend-scan/SKILL.md:56-81,100-106 |
| F076 | medium | gap | Workflow loops have no iteration cap; Critical handling ambiguous; push/CI/non-local migrations ungated | backend-orchestrator/SKILL.md:76,80,84,98,116,141-145 |
| F077 | medium | gap | Scan detects Rust/Ruby with no decision tree and misses PHP, .NET, Kotlin, Elixir, Deno and Bun | backend-scan/SKILL.md:60-66,163-187,253 |
| F079 | medium | defect | Scan applies one entry format to decisions.md and issues.md, conflicting with their schema | backend-scan/SKILL.md:105-106,153-161; memory-schema.md:180-187,220-227 |
| F080 | medium | gap | Partial memory not handled: mode choice is all-or-nothing and sync never initializes missing files | backend-scan/SKILL.md:91-92,119-120,258 |
| F081 | medium | defect | Sync deprecates planned designs written before implementation | backend-scan/SKILL.md:122-125; db-design:232; api-design:260 |
| F085 | medium | gap | Monorepo and workspace handling is undefined (first-match manifest, single memory dir, root commands) | scan:254-255; context-loading.md:48-51; test:154-174 |
| C006 | low (was medium) | gap | Memory files have no schema version, so memory written by earlier releases has no migration path | memory-schema.md (whole file); context-loading.md:122-144; backend-scan/SKILL.md:110-127 |
| C015 | low | gap | `mode=interactive` is named as the escape hatch but is defined nowhere | tool-rules.md:47 |
| F075 | low (was medium) | defect | Orchestrator per-step Reads lists contradict what the sub-skills load | backend-orchestrator/SKILL.md:66,74,78,82,92-98,114 |
| F078 | low (was medium) | defect | Scan decision trees are shallow or outdated (ORM, package manager, Go stdlib, Python signals) | backend-scan/SKILL.md:61,74,165-187 |
| F082 | low (was medium) | defect | Scan calls itself, and 'run backend-scan' is used for checks scan can't fix | scan:24-29,44; deploy:40; doctor:22 |
| F084 | low (was medium) | gap | Scan has no read-only guarantee and inherits a toolkit that runs installs, migrations and the app | scan:50-54,85-94; tool-rules.md:11 |
| F086 | low (was medium) | gap | Scan has no exit criteria, and its summary template pre-fills success | backend-scan/SKILL.md:189-249 |
| F234 | low | enhancement | Memory Refresh turns a sync into a full health check and fix loop | backend-orchestrator/SKILL.md:123-135 |
| F235 | low | enhancement | Orchestrator repeats lists and branching text | backend-orchestrator/SKILL.md:12-44,84,120,134,141-145 |
| F236 | low | gap | Scan has no budget, exclusion list or generated-code detection | scan:259-260; context-loading.md:18,48 |
| F237 | low | enhancement | Scan's 'principle-level concerns' duplicate principles.md and overlap doctor | backend-scan/SKILL.md:76-81 |
| F238 | low | enhancement | Scan description omits the 'run first when memory missing' trigger and is generic | backend-scan/SKILL.md:3,14-16 |
| F239 | low | gap | Quick Add Endpoint has no scan step and no security step for sensitive endpoints | backend-orchestrator/SKILL.md:87-103 |

### backend-architect & backend-visualize (31)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F020 | high | gap | backend-architect never persists its output: no file path, no memory update, no exit criteria | architect:111-167,206-287; implement:23-24,49-53 |
| F021 | medium (was high) | defect | Architect decision trees conflict; 'high scalability → microservices' contradicts the monolith-first guidance | backend-architect/SKILL.md:176-198,296-298 |
| F099 | medium | defect | ADR template format conflicts with decisions.md, and ADRs would be compacted away | architect:268-287; memory-schema.md:175-213,305-315 |
| F100 | medium | defect | Architecture templates assume a gateway, multiple services sharing a DB, cache and queue | backend-architect/SKILL.md:115-137,212-242 |
| F103 | medium | gap | No brownfield architecture process, although refactor routes redesigns to the architect | architect:66-70,292; refactor:25,301 |
| F105 | medium | defect | Three skills emit Mermaid with diverging conventions; architect and db-design never hand off to visualize | architect:115-125; db-design:147-177,347-377; visualize:14,98 |
| F107 | medium | defect | Visualize contradicts itself on color semantics (global palette vs per-group colors) | backend-visualize/SKILL.md:98-126,200-208,378,410,606,651-655 |
| F108 | medium | defect | Global theme block uses semicolons and has no diagram header, but is mandated for all diagrams | backend-visualize/SKILL.md:100-113,214-218,701 |
| F109 | medium | defect | classDiagram styling instructions contradict each other and use undocumented syntax | backend-visualize/SKILL.md:282-289,314,701-712 |
| F110 | medium | defect | Flowchart template uses 'Publish' as both a node id and a subgraph id | backend-visualize/SKILL.md:138,432,443,456-458,475 |
| F111 | medium | gap | No label-escaping or reserved-word rules; templates have unquoted special-character labels | backend-visualize/SKILL.md:326-327,389-399,679-712 |
| F112 | medium | defect | ERD sourced from db-schema.md has no column data, but the template needs PK/FK/UK columns | visualize:25-27,40,88,213; memory-schema.md:136-173 |
| F114 | medium | gap | Missing diagram types: state machine, C4, deployment, module dependency from code | backend-visualize/SKILL.md:38-45,65-77,700 |
| F118 | medium | gap | No render or validation step for generated Mermaid | backend-visualize/SKILL.md:136-138,630-660,686 |
| F119 | medium | defect | User/Actor template is copied from a specific ERP project and breaks the size rules | backend-visualize/SKILL.md:132,138,322-385,411 |
| F120 | medium | enhancement | backend-visualize is 722 lines, repeats rules and loads every template | backend-visualize/SKILL.md:142-626,679-712 |
| C016 | low | enhancement | Diagram conventions put meaning in color alone and never add Mermaid accessibility metadata | backend-visualize/SKILL.md:115-126, 630-660 |
| F101 | low (was medium) | gap | Tech-stack catalogue covers only Node/Python/Go/Java and omits gRPC, brokers and SSE | backend-architect/SKILL.md:94-109,171-174 |
| F102 | low (was medium) | gap | Requirements step doesn't quantify NFRs or cover DR, tenancy, threat model or cost | backend-architect/SKILL.md:48-60,200-204 |
| F104 | low (was medium) | gap | Database and protocol choice owned by architect, db-design and api-design with no authority rule | architect:94-109,240; db-design:14,63-83; api-design:71-86 |
| F106 | low (was medium) | defect | 'Architecture diagram' and 'ERD' triggers overlap; visualize's description lists only DB phrases | line 3 of all three |
| F113 | low (was medium) | gap | No concrete schema or flow extraction rules (globs, cardinality mapping, type sanitizing) | backend-visualize/SKILL.md:81-94,211-228,543-551 |
| F115 | low (was medium) | defect | Visualize always forces the diagram menu, even when the type is named or inferable | backend-visualize/SKILL.md:10,22-24,61-63,83,685 |
| F116 | low (was medium) | defect | Description-only diagrams are blocked by the project-root prerequisite | visualize:18,59,89,681; context-loading.md:27 |
| F117 | low (was medium) | defect | 'Update project memory' and 'visual decisions' point to memory content that doesn't exist | backend-visualize/SKILL.md:57,716-722 |
| F244 | low | defect | Architect's minor inconsistencies: duplicate questions, conflicting context lists | backend-architect/SKILL.md:26,31-44,52,64,166-167 |
| F246 | low | gap | Saving diagrams has no existing-file check or provenance | backend-visualize/SKILL.md:716-722 |
| F247 | low | defect | ERD example models M:N without a junction table and a multi-value column | backend-visualize/SKILL.md:153,168-172,659 |
| F248 | low | defect | Visualize's minor inconsistencies (eager vs lazy, & claim) | backend-visualize/SKILL.md:34,51-57,417 |
| F249 | low | defect | Nested code fences in visualize's Output Format break the document | backend-visualize/SKILL.md:642-660 |
| F250 | low | gap | Renderer version and dark-mode readability not addressed | backend-visualize/SKILL.md:146,200-208,512-541 |

### backend-db-design & backend-migrate (32)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F003 | high (was critical) | defect | Expand/contract rename example has no dual-write, so writes after the backfill are lost at DROP | backend-migrate/SKILL.md:70-90,108-117,135-142 |
| F022 | high | defect | NOT NULL 'safer sequence' still locks the table: no-op or unbatched UPDATE, then a full-scan SET NOT NULL | backend-migrate/SKILL.md:94-106,265 |
| F023 | high | gap | No lock_timeout or statement_timeout guidance for DDL | backend-migrate/SKILL.md:54-59,92-127,253-269 |
| F026 | high | gap | No tool-specific migration workflow; ORM rename-as-drop and DB-resetting commands are not flagged | backend-migrate/SKILL.md:25,46-280; implement:231-240 |
| F024 | medium (was high) | defect | CREATE INDEX CONCURRENTLY: transaction-wrapping ignored and failure guidance wrong | backend-migrate/SKILL.md:58,119-127,231-233 |
| F025 | medium (was high) | gap | backend-migrate has no confirmation gate or execution boundary for DDL, backfills, drops or restores on real DBs | backend-migrate/SKILL.md:30,75,89,194-200,213-225,271-280 |
| F027 | medium (was high) | gap | Rename guidance never carries UNIQUE, NOT NULL, indexes or dependents to the new column | backend-migrate/SKILL.md:79-90,108-117; db-design:112,120 |
| F121 | medium | defect | Backfill example assumes integer PKs and uuid-ossp, which conflicts with UUID schemas | migrate:84,102,136-149,167-172; db-design:111,274 |
| F123 | medium | gap | backend-migrate is effectively PostgreSQL-only although MySQL and MongoDB are recommended | migrate whole body; db-design:70-78 |
| F124 | medium | defect | Migrate checkpoint caveat redefines the contract, and git-checkout rollback can't undo applied migrations | migrate:165-175,282-286; tool-rules.md:53,59 |
| F125 | medium | defect | Down migrations promised for drops can't restore data, and there is no backup gate before contract | backend-migrate/SKILL.md:182-192,219-225,284-286 |
| F126 | medium | gap | Multi-release expand/contract has no phase tracking across sessions | migrate:271-286; orchestrator:50-145 |
| F131 | medium | defect | SQL templates: redundant email index, case-sensitive uniqueness, TIMESTAMP without tz, static updated_at, nullable defaults | db-design:109-122,270-288,323 |
| F132 | medium | defect | Soft-delete template models deletion twice and keeps a global UNIQUE email | backend-db-design/SKILL.md:236-240,274-286 |
| F135 | medium | enhancement | Primary-key strategy defaults to UUIDv4 everywhere with no criteria | backend-db-design/SKILL.md:92,111,274 |
| F136 | medium | gap | MySQL support claimed but only PostgreSQL DDL given, and no ORM schema output | backend-db-design/SKILL.md:70-73,87-145,268-345 |
| F137 | medium | gap | db-design Step 1.6 'MANDATORY' has no actions; the live schema is never inspected | backend-db-design/SKILL.md:36-38,57-61 |
| F139 | medium | defect | Identity and role model designed in db-design, auth and visualize with incompatible shapes | db-design:113-114,236-240,276-277; auth:92,159-162,187-189; visualize:153,168-172 |
| C010 | low (was medium) | gap | Query-plan verification uses EXPLAIN ANALYZE with no warning that it executes the statement | backend-migrate/SKILL.md:240-249 and 279; backend-implement/SKILL.md:268 |
| C013 | low (was medium) | gap | No internationalization guidance: character sets, collation, Unicode normalization or localized responses | backend-db-design/SKILL.md:70-73,87-118; backend-api-design/SKILL.md:144-174,318-348; principles.md (no i18n section) |
| F122 | low (was medium) | defect | Migration directory glob misses common layouts and stops greenfield first migrations | backend-migrate/SKILL.md:24-26 |
| F127 | low (was medium) | defect | Bare 'migration'/'migrate' triggers collide with framework, upgrade and API migrations | backend-migrate/SKILL.md:3,11 |
| F128 | low (was medium) | enhancement | Migrate verification depends on a staging DB; no local up/down/up, drift check or linter | backend-migrate/SKILL.md:213-249,278 |
| F129 | low (was medium) | gap | backend-migrate defines no deliverables or exit criteria | backend-migrate/SKILL.md:271-280 |
| F130 | low (was medium) | gap | db-design has no concrete deliverable or exit criteria; its only output is an optional memory save | backend-db-design/SKILL.md:215-232 |
| F133 | low (was medium) | defect | Database selection is partly inaccurate and ignores an already-chosen stack | backend-db-design/SKILL.md:14,63-83 |
| F134 | low (was medium) | gap | Foreign-key guidance is shallow: no FK-index rule, no ON DELETE choice, no FK DDL | backend-db-design/SKILL.md:93-97,109-122,312-325 |
| F138 | low (was medium) | gap | Domain depth gaps: concurrency columns, outbox table, money, enums, sensitive columns, naming | backend-db-design/SKILL.md:189-205,249-255,383-387 |
| F254 | low | defect | MongoDB template's sparse index is ineffective with default null, and no validator is shown | backend-db-design/SKILL.md:126-145,338-344 |
| F255 | low | defect | db-design has misplaced examples and placeholder steps | backend-db-design/SKILL.md:53-61,179-213 |
| F256 | low | enhancement | Duplicated example blocks inflate db-design | db-design:110-121 vs 271-288; 151-177 vs 348-377 |
| F257 | low | defect | Migrate polish: heading spacing, duplicated prerequisite, 'logical restore' misused | backend-migrate/SKILL.md:27,41,179-180,196 |

### backend-api-design & backend-auth (32)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F033 | high | gap | JWT guidance has no verification rules (alg pinning, iss/aud/exp/nbf, JWKS/kid, secret strength, revocation) | auth:72-122,246-249,274; deploy:250 |
| C014 | medium | gap | No HTTP caching semantics for API responses (Cache-Control, Vary, ETag/304), despite CDN advice | backend-api-design/SKILL.md:75; backend-ops/SKILL.md:137-142,365-368 |
| F030 | medium (was high) | defect | Auth code ownership split between backend-auth and backend-implement, with conflicting guidance | auth:3,185-225,293; implement:195-196,305-308 |
| F031 | medium (was high) | gap | backend-auth never saves decisions to memory, though the orchestrator says it writes decisions.md | auth:283-293; orchestrator:71 |
| F034 | medium (was high) | gap | GraphQL and gRPC claimed but only REST/OpenAPI has working guidance | backend-api-design/SKILL.md:3,78-86,109-130,246-260 |
| F035 | medium (was high) | gap | CSRF and session hardening are missing for cookie-borne credentials | backend-auth/SKILL.md:48-52,118-122,227-249,259-263,277-281 |
| F036 | medium (was high) | gap | Idempotency keys are mandated but no implementation pattern is given | principles.md:27; db-design:198 |
| F037 | medium (was high) | gap | No guidance for inbound or outbound webhooks (raw body, signature, dedup, retries, SSRF) | memory-schema.md:108; auth:67; test:58 |
| F141 | medium | gap | backend-api-design has no output path, validation or exit criteria | backend-api-design/SKILL.md:176-178,246-260 |
| F142 | medium | gap | API versioning and deprecation claimed but not covered | backend-api-design/SKILL.md:3,99-107,354,357 |
| F143 | medium | defect | Sample OpenAPI spec is invalid (dangling $refs), has no security and is on 3.0.0 | backend-api-design/SKILL.md:176-244 |
| F144 | medium | defect | Pagination mixes cursor and offset fields, and casing conventions are mixed | api-design:98-107,186-200,273-277; memory-schema.md:129 |
| F145 | medium | gap | No optimistic concurrency, long-running operation, bulk or PATCH-semantics patterns | backend-api-design/SKILL.md:102,132-174,262-296 |
| F146 | medium | gap | Rate limiting is required but not designed (algorithm, store, trusted proxy, headers) | principles.md:30; api-design:347,355; auth:231-234 |
| F147 | medium | gap | API design and principles omit BOLA, mass-assignment, SSRF and resource-limit controls | api-design:102-103,132-140; principles.md:24-31,42-49 |
| F148 | medium | gap | File uploads and object storage get five bullets with no security handling | backend-api-design/SKILL.md:279-284 |
| F149 | medium | gap | Real-time (WebSocket/SSE) has no auth, Origin, scaling or reliability guidance | api-design:286-290; architect:171-174; implement:198-199 |
| F150 | medium | defect | api-design duplicates and conflicts with backend-auth on auth endpoints and mechanism | api-design:3,56,93,101,144-150,264-271 |
| F151 | medium | defect | Auth contradicts itself on where authorization runs, and the middleware example has no failure path | backend-auth/SKILL.md:162,173-183,197-210 |
| F152 | medium | defect | Password policy and hashing guidance is outdated (NIST 800-63B-4, bcrypt 72-byte limit, rehash) | auth:126-143; api-design:148 |
| F153 | medium | gap | OAuth/OIDC client checks, enterprise SSO/SCIM and build-vs-buy IdP guidance missing | backend-auth/SKILL.md:60-64,157-183,265-269 |
| F155 | medium | gap | backend-auth has no verification step or negative-test exit criteria | backend-auth/SKILL.md:185-225,283-293 |
| F157 | medium | enhancement | api-design discovery has no concrete targets and may miss or overwrite an existing spec | backend-api-design/SKILL.md:61-65 |
| F158 | medium | gap | backend-auth activates for reviews but has only a design workflow | backend-auth/SKILL.md:14,25-27,283-293 |
| F140 | low (was medium) | gap | Tables that auth needs (refresh tokens, resets, MFA, lockout) never reach db-design | auth:108-116,145-155,187-189; orchestrator:61-72 |
| F154 | low (was medium) | gap | backend-auth discovery and examples are Node/TS-only despite a multi-language suite | backend-auth/SKILL.md:41-42,83-94,131-137,173-210 |
| F156 | low (was medium) | defect | api-design triggers collide with the orchestrator and implement, and miss contract keywords | api-design:3,10-14; orchestrator:10; implement:14 |
| F258 | low | enhancement | Error model ignores RFC 9457 and omits the correlation ID that ops requires | api-design:160-173,318-333; ops:77 |
| F259 | low | enhancement | Auth description misses common auth terms and uses broad ones | backend-auth/SKILL.md:3 |
| F260 | low | enhancement | api-design has duplicated templates and repeats its own prerequisite questions | api-design:21-23 vs 50-56; 98-107 vs 300-316; 160-173 vs 318-333 |
| F261 | low | enhancement | backend-auth is mostly reference text with no numbered workflow and no tool-rules reference | backend-auth/SKILL.md:44-282 |
| F262 | low | gap | Auth security headers are legacy-only and miss Cache-Control: no-store | backend-auth/SKILL.md:236-239 |

### backend-implement & backend-refactor (26)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F040 | high | gap | No skill owns bug fixing or debugging; refactor redirects to implement, which has no bug workflow | refactor:17,299; implement:3,8-15,216-270; test:119-125,198-204 |
| F041 | high | defect | Post-generation checklist greps pass without scanning, mis-match code, and the exit-0 rule can't be met | backend-implement/SKILL.md:61-98,144,161 |
| F045 | high | defect | Refactor reverts to 'last known-good commit' and deletes files with no clean-tree, branch or commit policy | refactor:66-68,133,137,159-166,182,241,267; tool-rules.md:53,59 |
| C007 | medium | defect | Implement's post-generation checklist is POSIX-only, despite the suite's cross-platform promise | backend-implement/SKILL.md:61-96; context-loading.md:5,146-157; backend-refactor/SKILL.md:292 |
| C008 | medium | defect | FastAPI and Gin handler snippets block the event loop or fall through after a bind error | backend-implement/SKILL.md:283-301 |
| C011 | medium | gap | No dependency license-compliance check anywhere in the suite | backend-implement/SKILL.md:182,207; backend-doctor/SKILL.md:114-132,215-220 |
| F039 | medium (was high) | defect | backend-implement and backend-refactor both trigger on refactor/split, with conflicting workflows | implement:3,15,242-251,262-270,355,359; refactor:3,17; orchestrator:36,43 |
| F043 | medium (was high) | defect | backend-implement writes and suggests applying migrations, bypassing backend-migrate and any gate | backend-implement/SKILL.md:193,208,231-240 |
| F044 | medium (was high) | defect | Refactor baseline hides failures (tee), writes into the repo, and its output hash can never match | backend-refactor/SKILL.md:70,78-89,153,279,292 |
| F047 | medium (was high) | defect | Refactor size and strangler rules can't be met for atomic or large in-process changes | backend-refactor/SKILL.md:126-147,166,265-266,290 |
| F048 | medium (was high) | defect | Canonical implement snippets persist the raw DTO (plaintext password), race on uniqueness and leak fields | backend-implement/SKILL.md:274-310 |
| F159 | medium | defect | Express async snippets in implement, auth and deploy never forward rejections | implement:276-280; auth:203-209; deploy:212-219 |
| F160 | medium | defect | Characterization-test ownership contradicts itself across refactor and test | refactor:24,38,84-88,181,283; test:34,127-133 |
| F161 | medium | defect | Refactor's 'test suite exists' gate passes on pyproject/go.mod and misses Spring *Tests.java | backend-refactor/SKILL.md:35-38 |
| F162 | medium | gap | Behavior lock omits implicit behavior (transactions, proxies, DI, log/metric names, query count) | backend-refactor/SKILL.md:93-99,174-182,281-292 |
| F163 | medium | gap | Strangler-fig guidance ignores flag defaults, parity checks and multi-session tracking | backend-refactor/SKILL.md:139-147,231-243 |
| F164 | medium | defect | Implement's Core Process skips the generate step and conflicts with mode=auto | backend-implement/SKILL.md:37-114,201-214,357 |
| F165 | medium | gap | Implement doesn't define deliverables or update api-patterns or db-schema memory | implement:201-214,220-240; memory-schema.md:111-112,150-153 |
| F166 | medium | gap | Refactor has no summary template or memory update for structural changes | backend-refactor/SKILL.md:70,149-157,291 |
| F167 | medium | gap | Java claimed but not covered; Django, NestJS and Spring missing across implement, ops and deploy | implement:3,124-171,274-310; refactor:3 |
| F169 | medium | gap | Implement adds dependencies and env config with no supply-chain or secret gate | backend-implement/SKILL.md:181-182,208 |
| F170 | medium | enhancement | Refactor in auto mode picks module boundaries for large splits without approval | backend-refactor/SKILL.md:63-70,93-99,174-177 |
| F168 | low (was medium) | gap | Implement has no guidance for consumers, gRPC, pagination, outbound clients or config validation | backend-implement/SKILL.md:184-199,325 |
| F263 | low | defect | Refactor's mode=auto pause rules contradict its HARD RULE and edge cases | backend-refactor/SKILL.md:27,69,182,196-197,241,284 |
| F264 | low | enhancement | Implement and refactor spend tokens on duplicated content | implement:110-171,272-342; refactor:17-25,139-147,168-271 |
| F273 | low | gap | Greenfield flow never initializes git, which checkpoints, rollback and staleness depend on | implement:116-214; tool-rules.md:59-60 |

### backend-test & backend-doctor (32)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F054 | high | gap | No security review, threat modeling or OWASP API Top 10 capability | doctor:13,150-168 |
| C009 | medium | defect | Doctor's `bandit -r .` scans virtualenvs and reports third-party code as project findings | backend-doctor/SKILL.md:65 (command table); severity rules at 163-168 and 191 |
| F042 | medium (was high) | gap | Tests and the app run autonomously with no check that the DB, queues or integrations are isolated | test:28-34,52,73,202; doctor:54-56,76-91,134-142; implement:267-268,335; refactor:39-41 |
| F051 | medium (was high) | gap | Doctor never writes findings to issues.md, though workflows depend on it | doctor:21,33,46,222-308; orchestrator:83-85,119,133 |
| F052 | medium (was high) | gap | Doctor and ops evidence rules copy live secret values into reports and memory | doctor:156,180-185,250; ops:346,351-357 |
| F053 | medium (was high) | defect | 'Update invalid tests ... re-run until green' lets the agent weaken or skip failing tests | backend-test/SKILL.md:30-34,198-204 |
| F055 | medium (was high) | gap | No performance investigation, profiling, load testing or before/after measurement | doctor:13,159,204-208,298; test:36-66 |
| F172 | medium | defect | Doctor marks issues.md both REQUIRED and optional; scan may never create it | doctor:21-22,26-35,45-46; scan:106 |
| F174 | medium | gap | No coverage commands, though before/after coverage is a required output | backend-test/SKILL.md:135-148,222-227,244 |
| F176 | medium | gap | No guidance on testing authentication and authorization | backend-test/SKILL.md:54-59,139-148 |
| F177 | medium | gap | No guidance on testing async consumers, idempotency or concurrency | test:51,183-186; principles.md:27,36,39 |
| F178 | medium | gap | Contract testing ignores the OpenAPI spec and consumer-driven contracts | backend-test/SKILL.md:54-59,97-101 |
| F179 | medium | gap | No ephemeral test infrastructure, property-based, fuzz or mutation testing | backend-test/SKILL.md:26,47-52,68-75 |
| F181 | medium | defect | Doctor audit commands: nonexistent Maven goal, unconfigured plugins, no Gradle, deprecated `safety check` | backend-doctor/SKILL.md:62-68,101,120,122 |
| F182 | medium | defect | Audit severity depends on prod vs dev dependencies, but the commands don't separate them | backend-doctor/SKILL.md:64,116-132 |
| F183 | medium | defect | Doctor's SQL-injection grep flags safe parameterized code and misses real sinks | backend-doctor/SKILL.md:155 |
| F184 | medium | gap | Weak secret detection: no scanner, no git-history check, no tracked .env check | backend-doctor/SKILL.md:65,150-168 |
| F185 | medium | defect | Doctor's 'Static Review' references a checklist that doesn't exist | backend-doctor/SKILL.md:74,163-174,302-307 |
| F186 | medium | defect | Doctor's letter grades have no rubric, and the sample contradicts its own data | backend-doctor/SKILL.md:229,237-242,293-300 |
| F187 | medium | defect | Severity rubrics conflict within doctor and between doctor and ops | doctor:91,148,166,191-194,264-291; ops:344-349 |
| F188 | medium | gap | Doctor doesn't separate environment failures from code defects | backend-doctor/SKILL.md:86-91,144-148 |
| F189 | medium | gap | Doctor omits build, coverage and migration-status checks its rules and report depend on | backend-doctor/SKILL.md:28-33,64-68,91,193,300 |
| F190 | medium | defect | Doctor's scope (diagnose vs fix) is unclear; auto mode implies applying non-risky fixes | backend-doctor/SKILL.md:54-56,196-220 |
| F191 | medium | gap | Doctor's smoke test isn't portable or robust (port, readiness, process tree, Windows curl) | backend-doctor/SKILL.md:136-144 |
| F192 | medium | gap | Python tooling assumes an active env; pip-audit may audit the wrong packages; the FastAPI start command is wrong | backend-doctor/SKILL.md:65,82,120,139 |
| F269 | medium (was low) | enhancement | Doctor repeats severity text and inlines an 85-line report template | backend-doctor/SKILL.md:24-46,91-194,222-308 |
| F173 | low (was medium) | defect | A REQUIRED test runner blocks the 'no tests' bootstrap and the refactor handoff | test:20-22,188-213; refactor:283 |
| F175 | low (was medium) | gap | backend-test claims multi-stack support but covers only Node, Python and Go (npm hard-coded) | backend-test/SKILL.md:21,154-174,206-213 |
| F180 | low (was medium) | defect | backend-test fixes production code itself, overlapping implement and the orchestrator | test:119-125,198-204; orchestrator:80,102 |
| F265 | low | defect | Regression rule says a bug fix may 'end with a failing test' | backend-test/SKILL.md:121-125 |
| F266 | low | gap | backend-test has no exit criteria; the output lists 'Run full suite' as still pending | backend-test/SKILL.md:215-220,235-254 |
| F267 | low | enhancement | Java framework recommendation is still JUnit 5 | backend-test/SKILL.md:213 |

### backend-ops & backend-deploy (38)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F028 | high | gap | No migration step in deploy pipelines and no migrate→deploy handoff | backend-deploy/SKILL.md:136-200; backend-migrate/SKILL.md:280 |
| F058 | high | gap | backend-deploy has no workflow, output paths, validation or exit criteria | backend-deploy/SKILL.md:8-278 |
| F060 | high | gap | Kubernetes/Helm advertised but there are no manifests, probes, resources or securityContext | backend-deploy/SKILL.md:3,13,273-278 |
| F063 | high | gap | No release strategy, deploy job, rollback or post-deploy verification | backend-deploy/SKILL.md:140-194,239-278 |
| F066 | high | gap | No resilience patterns for synchronous dependencies | ops:164-203; implement:317; principles.md:33-40 |
| F056 | medium (was high) | defect | Health endpoint paths contradict between ops, deploy and doctor | ops:104,249-251,265-267,315; deploy:204-207; doctor:141,148,282 |
| F057 | medium (was high) | gap | backend-deploy templates are Node-only though it detects Python, Go and Java | backend-deploy/SKILL.md:28-30,56-76,140-194,211-252 |
| F059 | medium (was high) | gap | backend-deploy has no confirmation gates for pushes, deploys or overwriting existing pipelines | backend-deploy/SKILL.md:169-173 (whole file) |
| F061 | medium (was high) | defect | Templates pin EOL or deprecated versions (Node 20, docker:24, npm --only, OpenAPI 3.0, safety check) | deploy:60,65,67,152,181,188-189; api-design:178,181 |
| F062 | medium (was high) | defect | docker-compose and .env.example produce a stack that won't start or connect | backend-deploy/SKILL.md:102-128,243-252 |
| F064 | medium (was high) | defect | GitHub Actions template lacks permissions (GHCR push fails) and uses static credentials | backend-deploy/SKILL.md:140-174,200 |
| F065 | medium (was high) | gap | SLOs, alerting, incident response and runbooks are triggers but have no content | backend-ops/SKILL.md:15,404-405 |
| F097 | medium | gap | Ops never records decisions or deployment memory, despite orchestrator claims | orchestrator:111,116; ops:411-418; deploy:42-52 |
| F193 | medium | defect | GitHub Actions template skips PR validation, invents script names and has no cache | backend-deploy/SKILL.md:142-157,169-173,198-200 |
| F194 | medium | defect | GitLab CI template can't push (no login), uses deprecated only:, and has no dind TLS | backend-deploy/SKILL.md:176-194 |
| F196 | medium | defect | Dockerfile template correctness and hardening problems | backend-deploy/SKILL.md:58-96 |
| F197 | medium | defect | Readiness and graceful-shutdown template drops requests and mishandles failures | backend-deploy/SKILL.md:211-237 |
| F199 | medium | gap | Secrets management is shallow: no provider integration, rotation runbook or leak response | ops:219-223; deploy:241,257-258 |
| F200 | medium | gap | No supply-chain controls in CI (image scanning, SBOM, signing, dependency updates) | backend-deploy/SKILL.md:136-200 |
| F201 | medium | gap | Infrastructure-as-code routed to deploy but not covered | deploy:3; orchestrator:41 |
| F202 | medium | gap | Serverless and PaaS recommended but have no implementation or deploy guidance | deploy:16,263-271; architect:89-92,177 |
| F203 | medium | defect | Deploy prerequisites duplicate context-loading and contradict themselves | backend-deploy/SKILL.md:18-52 |
| F204 | medium | defect | Ops has two process sections that disagree and contradict mode=auto | backend-ops/SKILL.md:231-261,411-418 |
| F205 | medium | gap | Ops audit covers only observability, not caching, messaging or config | backend-ops/SKILL.md:235-257,342-349 |
| F206 | medium | defect | Ops audit commands are POSIX-only, Node-centric and assume src/ | backend-ops/SKILL.md:240-255 |
| F207 | medium | defect | Ops scaffolding snippets are incomplete or wrong | backend-ops/SKILL.md:275-287,302-311,330-339 |
| F208 | medium | gap | Ops scaffolding covers only Express, FastAPI and net/http, with no OpenTelemetry bootstrap | backend-ops/SKILL.md:117-122,261-340 |
| F209 | medium | gap | /metrics served on the public port, and metric cardinality not addressed | backend-ops/SKILL.md:94-107,269-274,322-325 |
| F210 | medium | defect | Caching guidance is inaccurate (write-through 'always consistent') and omits tenant-scoped keys | backend-ops/SKILL.md:137-162,383 |
| F211 | medium | defect | Messaging and outbox guidance misstates delivery semantics and lacks dedup and ordering | backend-ops/SKILL.md:164-203,391-392 |
| F212 | medium | defect | Ownership of secrets, config, promotion, health and correlation IDs overlaps across ops, deploy, auth and implement | ops:13,102-107,219-229; deploy:14-15,202-259; auth:246-249; implement:256 |
| F214 | medium | gap | Ops has no deliverables, report template or verification | backend-ops/SKILL.md:259-261,342-359,411-418 |
| F215 | medium | defect | Outdated OTel semantic conventions and Jaeger exporter; no sampling or PII guidance | backend-ops/SKILL.md:117-131 |
| F195 | low (was medium) | defect | CI actions are outdated and pinned by mutable tag | backend-deploy/SKILL.md:149-169 |
| F198 | low (was medium) | defect | .env.example ships a non-empty placeholder JWT secret that defeats fail-fast checks | deploy:250; ops:209-211 |
| F213 | low (was medium) | enhancement | Ops and deploy descriptions miss key triggers and collide on generic words | line 3 of ops and deploy |
| F270 | low | defect | backend-ops has no standard Prerequisites block and has duplicate context lists | backend-ops/SKILL.md:17-35; version-changelog.md:20 |
| F271 | low | defect | PII redaction suggests plain hashing of low-entropy identifiers | backend-ops/SKILL.md:79-83 |

### Cross-cutting coverage gaps (32)

| ID | Severity | Kind | Finding | Where |
|---|---|---|---|---|
| F018 | high | defect | _shared is resolved via a project-relative path that doesn't exist on global installs; REQUIRED checks hard-stop | architect:22-24; auth:22-24; deploy:25-27; context-loading.md:73-79; README.md:61-65 |
| F029 | high | gap | Multi-tenancy is one line; the auth ownership example permits cross-tenant access | db-design:387; auth:81,166,169-178; architect:169-204 |
| F068 | high | gap | No backup, restore drill or disaster-recovery coverage | migrate:194-200; orchestrator:105-121 |
| F050 | medium (was high) | gap | OpenCode/OMO tool names and LSP-dependent gates have no CLI fallback on the advertised Cursor and Gemini hosts | tool-rules.md:3,10-12; refactor:70,105-106,154-155,265-266; doctor:103,157,187; scan:20,52 |
| F067 | medium (was high) | gap | No scheduled jobs, job lifecycle, outbox relay or saga guidance | ops:164-203,182-187; architect:149,254 |
| F069 | medium (was high) | gap | Stacks beyond Node/Python/Go/Java are unsupported, and deploy hard-stops on them | context-loading.md:18,48; deploy:28-30; doctor:62-68 |
| F070 | medium (was high) | gap | No guidance for LLM/AI feature backends (RAG, vector stores, LLM gateway) | architect:94-109; db-design:63-83 |
| F071 | medium (was high) | gap | No framework or dependency major-upgrade workflow (e.g. Spring Boot 2.7→3) | refactor:17,27,245-257; doctor:215-220 |
| F091 | medium | defect | Design skills' mandatory question-and-confirm steps conflict with mode=auto and gate handoffs | architect:48-60,158-167; db-design:22-24,42-51,232; api-design:21-23,50-60,260; auth:25-27 |
| F092 | medium | defect | Context-loading boilerplate is repeated in most skills, and the copies contradict each other | implement:28-53; visualize:16-59; ops:17-35; scan:36-42,100-138; context-loading.md:187-200 |
| F095 | medium | enhancement | Generic one-word triggers ('test', 'config', 'session', 'health check') collide across skills | frontmatter line 3: test, ops, scan, auth, refactor, doctor; test:30 |
| F098 | medium | gap | No scripts/ for deterministic logic currently done by hand in prose | context-loading.md:118-144; memory-schema.md:305-315; implement:59-108; visualize:689-712 |
| F226 | medium | gap | No API documentation publishing or SDK generation | backend-api-design/SKILL.md:176-244 |
| F227 | medium | gap | No data privacy or compliance capability (retention, erasure, DSAR, field encryption) | ops:79-83; db-design:240; principles.md:44 |
| F229 | medium | gap | No diff-scoped PR review mode | doctor:76-168; orchestrator:21,39 |
| F230 | medium | gap | Search has no indexing, sync or reindex guidance | api-design:292-296; db-design:386 |
| F231 | medium | gap | No event/message contract design or schema evolution | ops:164-203; refactor:97 |
| F232 | medium | gap | Payments and money movement not covered | db-design:249-255; principles.md:46 |
| F233 | medium | gap | No workflow for extracting a microservice or splitting data ownership | architect:198,298; refactor:231-243 |
| F285 | medium (was low) | gap | No human-facing documentation workflow (ADR files, README, runbooks) | architect:268-287; memory-schema.md:175-213 |
| C017 | low | gap | Issue and PR templates don't collect what's needed to triage AI-skill bugs or keep releases and translations in sync | bug_report.md:10-37; question.md:21-26; PULL_REQUEST_TEMPLATE.md:52-58 |
| F090 | low (was medium) | defect | Skills redefine mode=auto instead of referencing the contract | test:28-34; doctor:54-56; tool-rules.md:49 |
| F228 | low (was medium) | gap | Feature flags are three bullets with no lifecycle or tooling | backend-ops/SKILL.md:213-217 |
| F240 | low | gap | No worked input→output examples, especially for routing | orchestrator:28-48; scan:189-249 |
| F241 | low | enhancement | Descriptions written as imperatives with inconsistent phrasing | line 3 of all 14 SKILL.md |
| F242 | low | enhancement | Frontmatter has no version, license or compatibility metadata | frontmatter lines 1-4 (all 14) |
| F243 | low | defect | 'MANDATORY' Step 1.5/1.6 stubs are contentless and numbered differently across skills | api-design:61,67; architect:62,66; db-design:53,57; version-changelog.md:22 |
| F245 | low | enhancement | Textbook content takes up a large share of several skills | architect:72-109,206-287; db-design:63-83; api-design:335-348; ops:60-100; principles.md:16-18 |
| F251 | low | gap | No domain modeling or lifecycle state machines | db-design:245,254 |
| F252 | low | gap | Cost and FinOps only mentioned in passing | architect:55,90,294 |
| F284 | low | gap | No analytics, ETL/ELT or CDC pipeline guidance | backend-architect/SKILL.md:182-186 |
| F286 | low | gap | No transactional notifications (email, SMS, push) | backend-implement/SKILL.md:317,325 |
