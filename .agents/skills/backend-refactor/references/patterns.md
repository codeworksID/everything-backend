# Refactor Pattern Catalog

Pick the pattern that matches the user's intent, then apply it in increments (SKILL.md Step 5). Every pattern below is behavior-preserving: if a step would change an observable contract, stop and ask.

## Choosing a Pattern

| User intent | Pattern |
|---|---|
| "This controller/service does too much" | Split Fat Controller / Service |
| "Extract this into a separate module" | Extract Module |
| "Too many dependencies / hard to test" | Reduce Coupling |
| "Depend on abstractions, not implementations" | Dependency Inversion / Ports-and-Adapters |
| "Replace this legacy module or service without a big bang" | Strangler Fig (see `strangler-fig.md`) |
| "Modernize old code style or framework APIs" | Modernize Legacy |
| "Rename or move this symbol or file" | Rename / Move Symbol |

In-process moves and renames that touch many files use an alias or facade (Extract Module, step 5), not a strangler fig. Keep strangler fig for replacing a module or service behind a stable interface.

## Grouping Heuristics (for splits and extractions)

Use these to propose module boundaries. In SKILL.md Step 4 the proposal is shown to the user before any code moves.

- Group by the data each method reads and writes: methods that share the same tables, aggregates, or fields belong together.
- Group by reason to change: methods changed together in recent history (check the version history of the file) usually belong together.
- Separate responsibility axes: transport mapping, business workflow, persistence, and external calls.
- Separate by actor or use case: e.g. user CRUD vs. user notifications vs. user analytics.
- Avoid boundaries that need a transaction to span two new modules. If one does, keep the transaction owner in one place (see the implicit-contract checklist in `baseline-and-verification.md`).

## Split Fat Controller / Service

**Problem**: a controller or service handles several unrelated concerns, is hundreds of lines long, or is hard to unit test.

**Approach**:

1. Identify cohesive responsibility groups (see Grouping Heuristics).
2. Extract one group at a time into a new service or use-case class.
3. Move business rules and invariants into the extracted service. When moving transaction ownership, keep the same transaction boundary: work that committed atomically before must still commit atomically.
4. Leave the original controller or handler as thin transport glue that delegates to the new service.
5. Wire the new service through the composition root or DI container.
6. Move or add tests for the extracted service. Keep existing tests and characterization tests until verification passes.
7. Remove the old methods from the original once all callers use the new service.

**Verification**: every extracted method is covered by at least one test; the controller has no business branching beyond validation and response mapping; the app still boots (DI wiring resolves).

## Extract Module

**Problem**: a file or directory has grown too large or holds logic that belongs to a distinct bounded context.

**Approach**:

1. Identify the cohesive subset to extract (functions, classes, routes).
2. Create the target module with a clean public interface (one entry point or barrel export).
3. Move the code, keeping its internal dependencies intact.
4. Update import paths in the source module and in all external callers.
5. If many callers exist, re-export or alias from the old location for now and mark it deprecated in a comment. This keeps each increment small and green.
6. Remove the alias once every caller is updated.

**Verification**: no references to the old import path remain (find references via LSP if available, and search file contents for string-based imports); diagnostics are clean in both old and new locations.

## Reduce Coupling

**Problem**: a module depends on too many concrete implementations, so it is hard to test or change.

**Approach**:

1. Map the target module's incoming and outgoing dependencies.
2. Identify dependencies that are implementation details (direct DB access, HTTP clients, file I/O).
3. Define interfaces or ports for them.
4. Replace direct usage with the interfaces.
5. Move concrete implementations into adapter modules.
6. Inject adapters through the composition root or DI container.
7. Use fakes for the adapters in unit tests.

When the extracted adapter is a repository, move each query exactly: keep its bound parameters and owner predicate. The port takes the owner as an argument (`findOrder(tenantId, orderId)`, not `findOrder(orderId)`), so a caller cannot forget it. Do not widen a method into a generic `findBy(column, value)` or `query(sqlString)` that callers feed raw input; if a sort or filter field must be dynamic, the adapter maps it through a fixed allowlist (`_shared/sql-safety.md` -> The Rules, 2-3).

**Verification**: the target module imports no concrete infrastructure packages; its unit tests run with no database or HTTP server; every moved query keeps its placeholders and owner predicate (`_shared/sql-safety.md` -> Verification, steps 1-2).

## Dependency Inversion / Ports-and-Adapters

**Problem**: core business logic depends on a framework or infrastructure, which blocks testing and reuse.

**Approach**:

1. Define a domain or service layer with no outward dependencies (pure business rules).
2. Define ports (interfaces) for every external interaction: persistence, messaging, HTTP, file system, clock, randomness.
3. Implement adapters that fulfil those ports with concrete infrastructure.
4. Wire adapters in the composition root.
5. Use test doubles for adapters in unit tests.

**Verification**: searching the domain or service layer for framework imports (e.g. `express`, `fastify`, `@nestjs`, `fastapi`, `django`, `gin`, `org.springframework`) returns zero matches.

## Modernize Legacy

**Problem**: code uses outdated patterns, deprecated APIs, or conventions that hurt maintainability.

**Approach**:

1. Name the target modernization (e.g. callbacks to async/await, an old ORM API to the new one, `javax.*` to `jakarta.*`).
2. Make sure characterization tests cover the current behavior (SKILL.md Step 1).
3. Apply the change one function or module at a time. A tool-driven mechanical change (codemod, IDE or LSP rename, namespace bump) that cannot be split may be one increment; see the size rule in SKILL.md Step 5.
4. Run the tests after each change.
5. Update lint rules or type definitions if the modernization changes conventions.

When moving to a new ORM or query API, map each call to the safe variant in `_shared/sql-safety.md` -> Safe vs Unsafe APIs per Stack. A raw query that was parameterized must not become `$queryRawUnsafe`, `sql.raw`, `knex.raw` with interpolation, `text(f"...")`, `Sprintf` into SQL, MyBatis `${}` or `FromSqlRaw` with concatenation.

Watch for behavior drift that tests often miss: error types thrown vs. returned, unhandled promise rejections, changed default timeouts, and changed serialization (dates, decimals, null vs. missing).

A dependency or framework upgrade is not just a refactor: installing or upgrading packages is Always Ask First in `tool-rules.md`, and a major version bump with behavior changes belongs with the user's approval and a separate plan.

**Verification**: no behavioral change; all characterization tests pass; diagnostics clean.

## Rename / Move Symbol

**Problem**: a function, class, module, or file has a misleading name or sits in the wrong place.

**Approach**:

1. If the host has LSP, check that the symbol can be renamed (prepare-rename), then apply the rename across the workspace. Otherwise search file contents for every reference, including string-based ones, and edit them.
2. For a file move, create the new file, update all imports, then delete the old file after the user confirms (the run did not create it; see the Deletion rule in SKILL.md Step 5).
3. Find references to the old name or path to confirm none remain. Also search config files, DI registrations, reflection strings, and docs.
4. Run the test suite.

**Verification**: zero references to the old name or path; diagnostics clean; tests pass.

## Breaking Circular Dependencies

If a refactor reveals circular imports, break the cycle by introducing an interface or port in the module that should not depend on the other, and point the dependency at the interface (dependency inversion). Do not break a cycle by inlining duplicated code.
