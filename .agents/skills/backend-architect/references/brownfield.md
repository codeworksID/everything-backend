# Brownfield Architecture

Read this when the system already exists: a redesign, a split, a consolidation, or a redesign request routed from backend-refactor.

Rule: document the current state before proposing the target state. Never design an existing system from a greenfield questionnaire.

## 1. Start From Scan Memory

- Load project-overview.md, tech-stack.md, db-schema.md, api-patterns.md, decisions.md and issues.md.
- If any are missing or stale, run backend-scan (mode=auto) or ask the user to, before going on.
- Read existing Accepted decisions. A new design that conflicts with one needs a superseding ADR.

## 2. Derive the Current Architecture

Confirm memory against the code. Live code wins over memory.

- **Modules**: find the top-level source folders and entry points (HTTP server, workers, cron, CLI).
- **Dependencies between modules**: search file contents for imports across module folders; check LSP references if available. Note every cross-module call and every cross-module table access.
- **Data ownership**: for each table, list the modules that read it and the modules that write it. Tables written by several modules are boundary problems.
- **Integrations**: external APIs, queues, webhooks, file stores.
- **Runtime shape**: how it is deployed and scaled today (from deployment.md or deploy config).

## 3. Record Pain Points With Evidence

For each pain point write: problem -> evidence -> impact. Evidence is a file path, a metric, an incident or an issues.md entry. Drop pain points without evidence or mark them "(reported, unverified)".

Typical findings: god modules, circular dependencies, shared tables written by many modules, synchronous chains of remote calls, missing idempotency on retries, no clear owner for a workflow.

## 4. Define the Target State

Fill the Target State section of the overview. Change only what a pain point or a new requirement justifies. Prefer the smallest move that fixes the problem:

1. Enforce boundaries inside the current deployable (modular monolith).
2. Split data ownership inside one database (each module owns its tables; others use its interface).
3. Extract a service only when the extraction triggers below are met.

Ask backend-visualize for a current vs target diagram pair.

## 5. Plan Phased Migration

Each phase must leave the system releasable. For each phase write: change, exit criteria, rollback, and owner skill.

- Behavior-preserving moves (split a module, invert a dependency, strangler-fig routing): backend-refactor, with a test baseline from backend-test first.
- New modules or interfaces: backend-implement.
- Schema changes: backend-db-design for the design, backend-migrate for expand -> migrate data -> contract migrations.
- Release of each phase: backend-deploy.

Write an ADR for each phase boundary that changes the architecture, so the plan survives between sessions.

## Service Extraction Triggers

Extract a service only when at least one of these holds and the module boundary has been stable for a while:

- A separate team needs to deploy it independently.
- Its scaling, runtime or availability needs differ sharply from the rest.
- It needs isolation for security or compliance reasons.

Before extracting:

- The module already owns its data and is reached only through its interface.
- No other module writes its tables.
- Calls into it tolerate network failure (timeouts, retries with idempotency, fallbacks).

Extraction steps, at outline level: route calls through the module interface; move its tables to a separate schema or database with the service as the only writer; add an anti-corruption layer where the models differ; run the new service in shadow or behind a flag; cut over gradually; remove the old path. Record the triggers that were met in the ADR.
