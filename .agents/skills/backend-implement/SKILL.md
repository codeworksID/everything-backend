---
name: backend-implement
description: Writes backend feature code from a design or adds new features to an existing codebase, covering endpoints, services, repositories, models, middleware and wiring for Node.js/TypeScript, Python, Go and Java backends. Keeps controllers thin, runs a post-generation layering and safety checklist, updates API memory, and hands schema changes to backend-migrate. Use when the user says "implement this", "build this feature", "generate the code", "add an endpoint", "add a field to the model", "add middleware", or asks how to build a designed feature. Not for bug fixes or failing behavior (use backend-debug), behavior-preserving restructuring such as splitting or renaming code (use backend-refactor), or writing and applying migrations (use backend-migrate).
---

# Backend Implement

Turns a design into working code, or adds a feature to code that already exists. It writes source files, tests and memory entries. It never writes or applies migrations.

## When to Use

- The user wants code generated from an architecture, API or schema design.
- The user says "implement", "build this", "generate the code", "how do I add X?".
- Adding a new endpoint, field, service method, middleware, or repository query to existing code.
- An orchestrator workflow reaches its implementation step.

## Route Elsewhere

| Request | Skill |
|---|---|
| Bug report, failing test, 500 error, wrong output, "fix this" | `backend-debug` |
| Split a fat controller or service, extract, rename, move, clean up with identical behavior | `backend-refactor` |
| Write or apply a migration, change a column on a live table | `backend-migrate` |
| Choose the auth mechanism, token lifetimes, role model | `backend-auth` |
| Design endpoints or the API contract | `backend-api-design` |
| Security review of the code | `backend-security` |

If a request mixes a feature with a refactor, do the refactor first through `backend-refactor`, then implement the feature on the green result. Never mix the two in one run.

## Before You Start

1. Resolve the shared docs folder (`<shared>`): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, Production Targets, Test Integrity, checkpoints), `<shared>/principles.md` (code, API, system and security principles that every change must follow), and `<shared>/host-tools.md` if the actions below don't match your host's tool names.
3. Load project memory per `<shared>/context-loading.md`. Always load `tech-stack.md`, `project-overview.md`, `api-patterns.md` and `db-schema.md`. Load `decisions.md` only when the change raises an architecture, auth or cross-cutting question.
   - `tech-stack.md` missing and the stack cannot be inferred from manifests: run `backend-scan` first.
   - No design for the feature (no endpoint in `api-patterns.md`, no tables in `db-schema.md`, nothing from the user): run `backend-api-design` and/or `backend-db-design` first, or proceed only on a design the user gives in the request.
4. If the detected stack matches a file in `<shared>/stacks/`, read it.
5. Read `<shared>/sql-safety.md` before writing any query or repository code. Its rules are not optional: bound values, allowlisted identifiers, and an owner predicate from the authenticated principal on every tenant- or user-owned row.
6. Read `<shared>/secure-coding.md` -> The Rules before writing handlers, services or integrations. S1-S18 are not optional either: schema validation, no mass assignment, deny-by-default access, no shell or eval, contained paths, SSRF-safe outbound calls, safe parsers, vetted crypto, no secrets in code or logs, bounded resources.

## Workflow

### Step 1: Scope the change

1. Name a feature slug in kebab-case from the request (for example `user-registration`). Every checkpoint and memory entry for this run uses it.
2. Pick the path:
   - **Greenfield** (new service or module from a design): read [references/greenfield.md](references/greenfield.md).
   - **Modify existing code** (endpoint, field, middleware, query): read [references/modify-workflows.md](references/modify-workflows.md) and pick the matching workflow.
3. Find the files involved: find files by layer, search file contents for the routes, services and models the feature touches, and read them. Match the project's existing style, error mapping and test framework.
4. List what the feature needs that is out of scope here (schema change, auth decision, refactor) and route it per the table above.

Output: feature slug, path, list of files to create or edit, list of hand-offs.

### Step 2: Start a checkpoint

Start a checkpoint before the first edit:

```
node <shared>/scripts/checkpoint.js start --skill backend-implement --feature <slug> --steps "plan,implement,tests,checklist,memory"
```

- Exit code 3 means an open checkpoint exists for this slug. Offer to resume (continue from its first pending step) or restart (`--restart`). In `mode=auto`, resume.
- On resume, check diagnostics on every file in the checkpoint's `created_files` and `modified_files` before continuing. Code that was clean may have drifted while the checkpoint was idle.
- If the tree was dirty at start and you must edit one of those files, back it up first: `checkpoint.js backup --skill backend-implement --feature <slug> <file>`.
- Record each file you create or edit (`checkpoint.js record --skill backend-implement --feature <slug> --created a,b --modified c,d`), mark each step done with `--done <step>`, and run `checkpoint.js snapshot` after each step.
- If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.

### Step 3: Implement

1. Generate or edit code layer by layer: repository, then service, then handler, then wiring. Use the shapes in [references/patterns.md](references/patterns.md).
2. Apply `<shared>/principles.md`: thin transport, services own workflow and transactions, typed errors mapped centrally, validation at the boundary, no secrets in responses or logs.
   - Every query follows `<shared>/sql-safety.md`. Sort and filter fields map through a server-side allowlist, and reads and writes of owned rows bind `tenant_id` or `user_id` from the authenticated principal, never from the request.
   - Every handler, service and integration follows `<shared>/secure-coding.md`: input and output DTOs (never the request body onto a model), shell-free process calls, contained file paths, outbound URLs checked against SSRF, safe parsers, CSPRNG tokens, constant-time secret compares, bounded sizes and timeouts.
3. Models and ORM entities may change here. The schema change itself goes to `backend-migrate` with the full column, index and constraint spec. Never turn on ORM auto-sync against anything but a disposable local database this run started.
4. Auth code implements the decision `backend-auth` recorded. If none exists, stop that part and route to `backend-auth`.
5. New dependencies pass the license gate below, and installing them always asks first.
6. Add tests with the code: unit tests for services, endpoint or contract tests for routes, integration tests for repositories against a provably local database.

Output: the changed files, recorded in the checkpoint.

### Step 4: Run the post-generation checklist

Read [references/post-generation-checklist.md](references/post-generation-checklist.md) and run all thirteen checks against this run's files only: layering, transactions, SQL building and unsafe raw APIs, input validation, framework leaks, error mapping, suppressions, diagnostics, test coverage, owner predicates, hostile-input tests, the security scan (`<shared>/scripts/security-scan.js`), and the secure-coding review.

- Fix each finding, or list it with `file:line` and a one-line justification. A string-built query, an unsafe raw API with input, or a missing owner predicate is never justified: fix it.
- Run the tests you added and the existing suite, but only when every target is provably local (see `<shared>/tool-rules.md` -> Production Targets). Follow Test Integrity: never skip, delete or loosen a failing test to get green. If a failure is a bug outside this feature, hand it to `backend-debug`.

Done when the checklist verdict is **clean**, or **incomplete** with each unrun check and the command the user should run.

### Step 5: Hand off

- **Schema changes**: hand to `backend-migrate` with the spec (table, column type, nullability, default, index, foreign key, and whether existing rows need a backfill). Keep the code compatible with the old and new schema until `backend-migrate` finishes its contract step.
- **Bugs found on the way**: log them in `issues.md` and hand to `backend-debug`. Do not fix unrelated bugs in this run.
- **Restructuring needed first**: hand to `backend-refactor`.

### Step 6: Update memory

Use the timestamped block format in `<shared>/memory-schema.md` -> General Update Format. Append; never overwrite.

- `api-patterns.md` -> Endpoints: each endpoint added or changed (method, path, auth requirement, request and response shape, source file).
- `project-overview.md` -> Structure or Module Boundaries: only when this run added a new module or layer.
- `issues.md`: open items from the checklist that were justified rather than fixed, and bugs handed to `backend-debug`.
- `db-schema.md` is updated by `backend-migrate` when it writes the migration, not here.

Record each memory file in the checkpoint (`checkpoint.js record ... --memory <file>`).

### Step 7: Report and close

Report:

- Feature slug and path (greenfield or modify)
- Files created and modified, by layer
- Dependencies added with their licenses, or the install command waiting for approval
- Checklist verdict and any justified findings with `file:line`
- Tests added and the test run result (or why it did not run)
- Hand-offs: schema spec for `backend-migrate`, bugs for `backend-debug`, refactors for `backend-refactor`
- Memory files updated

Then close the checkpoint: `node <shared>/scripts/checkpoint.js close --skill backend-implement --feature <slug> --status completed`.

**Done when** the code for the feature is written, the checklist is clean (or incomplete with reasons), the tests this run added pass on local targets or are reported as not run, every hand-off is listed, memory is updated, and the checkpoint is closed.

## Pause Points

`<shared>/tool-rules.md` -> `mode=auto` Contract is the single source of truth. For this skill, the actions that always ask first are:

- Installing, upgrading or removing a dependency.
- Running tests, seeds or the app when any database, queue or external service is not provably local.
- Editing `.env*`, credential or key files, or CI/CD configuration. Write `.env.example` instead.
- Deleting or wholesale replacing a file this run did not create.
- Any git operation that writes refs.

In `mode=auto`, everything else in the workflow runs without asking, and the run reports at the end. Pause for ambiguity only: missing design, conflicting decisions, or a risky choice with more than one reasonable option. In `mode=interactive`, show each planned file change and wait for approval.

## License Gate for New Dependencies

Before adding a package, check its license in the registry metadata or the package's own files.

- Permissive (MIT, Apache-2.0, BSD, ISC, and similar): proceed.
- Copyleft (GPL, AGPL, LGPL, MPL, SSPL), "unknown", or no license: ask first, name the license, and suggest a permissive alternative if one exists.
- List every new dependency and its license in the report.

## References

- [references/greenfield.md](references/greenfield.md): read when building a new service or module from a design (project layouts for Node, NestJS, FastAPI, Django, Go and Spring; what to generate per layer; decision trees for REST, GraphQL, database, auth and WebSocket).
- [references/modify-workflows.md](references/modify-workflows.md): read when adding an endpoint, a field, middleware, or a query change to existing code.
- [references/patterns.md](references/patterns.md): read when writing handlers, services or repositories (Express, FastAPI, Gin, Spring, service and owner-scoped repository snippets; layering, transaction, idempotency and testing rules).
- [references/post-generation-checklist.md](references/post-generation-checklist.md): read at Step 4, every run.

## Edge Cases

- **No design exists**: run `backend-architect` and `backend-api-design` first, or proceed only on a design the user gives.
- **Memory is stale**: run `backend-scan` before generating code against it.
- **Feature needs a schema change**: hand it to `backend-migrate`; never write or apply migrations here.
- **The user reports a bug while asking for a feature**: implement the feature; hand the bug to `backend-debug`.
- **Complex business logic**: split it into smaller services or use cases with domain types.
- **Legacy code**: add the feature behind a narrow interface and replace incrementally; any restructuring goes to `backend-refactor`.
- **Multiple languages in the repo**: ask which service to change if the request does not say.
- **Large feature**: build one layer at a time and snapshot the checkpoint after each.
- **Existing tests**: match their framework, layout and fixtures.
- **Fat controller temptation**: never add business rules to a handler to save time. Put new rules in a service; if the controller is already fat, hand the split to `backend-refactor` before adding more endpoints.
- **Repository doing too much**: keep new queries intent-oriented and persistence-only; inject collaborators into the service instead of the repository, and hand any split of existing repository code to `backend-refactor`.
- **Stack not covered by references**: follow the framework's own conventions and map them to the same layers (transport, service, repository).
