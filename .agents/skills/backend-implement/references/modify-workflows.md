# Modifying Existing Code

Most backend work is evolution, not greenfield. Pick the workflow that matches the request. Each one ends with the memory updates and checks in `SKILL.md` Steps 6 and 7.

Not here:

- Splitting a fat controller or service, extracting modules, renaming, or any change that must keep behavior identical: hand off to `backend-refactor`, which locks behavior with a test baseline first.
- A bug, a failing test, a 500, or wrong output: hand off to `backend-debug`.
- Writing or applying a migration: hand off to `backend-migrate`.

## Add a New Endpoint to an Existing Controller

1. Read the existing controller, service, repository, and route files. Read the contract for the endpoint in `api-patterns.md` or the OpenAPI spec.
2. Reuse the existing request/response schema style and error mapping.
3. Add the route entry.
4. Add the handler as thin transport: parse and validate input, call the service, map output or error.
5. Add the service method for the business workflow. Open a transaction if the flow writes more than once or to more than one store.
6. Add or extend repository methods as intent-oriented queries. Bind every value, and on tenant- or user-owned tables take the owner as a parameter and put it in the WHERE clause (`<shared>/sql-safety.md`, rules 1 and 3). The service passes it from the authenticated principal.
7. Add unit tests for the service and endpoint or contract tests for the route, including hostile-input tests for any search, filter, sort or id parameter (`<shared>/sql-safety.md` -> Verification, step 4).
8. Check diagnostics and run the existing tests (local targets only, per the Production Targets rule).
9. Append the endpoint to `api-patterns.md` -> Endpoints (method, path, auth, request and response shape, source file).

## Add a New Column or Field to an Existing Model

1. Check `db-schema.md` and the existing model or entity definition.
2. Add the field to the model, the request/response schema or serializer, and any DTO used across layers.
3. Hand the schema change to `backend-migrate` with the column spec from `db-schema.md` (type, nullability, default, index, foreign key). Do not write or apply the migration here. `backend-migrate` owns zero-downtime checks and updates `db-schema.md`.
4. If `backend-migrate` plans expand/contract or a backfill, keep the code working against both the old and the new schema until the contract step. For example, treat the new field as nullable and write both old and new columns while dual-write is active.
5. Update repository queries that select, filter, or order by the new field. If clients can sort or filter by it, add it to the server-side allowlist that maps API names to columns; never pass the client's field name into the query (`<shared>/sql-safety.md`, rule 2).
6. Update service invariants that depend on the field.
7. Update request/response validation rules.
8. Add integration tests for repository behavior against the migrated schema. Migration correctness itself is verified by `backend-migrate`.
9. Update seed data and fixture files if they break. Running seeds against a database follows Always Ask First.

## Add Middleware to an Existing Pipeline

1. Read the current middleware stack and its registration order.
2. Decide where the new middleware belongs: correlation IDs, logging, auth, rate limiting, validation, error recovery. Error mapping goes last.
3. Implement it as a focused unit with no business branching beyond its own concern.
4. Register it in the framework pipeline in the correct order.
5. Add endpoint or contract tests that exercise the new behavior.
6. Check diagnostics and run the existing test suite to confirm the other routes still pass.

For auth middleware, implement the mechanism `backend-auth` decided. Do not design it here.

## Change a Repository Query for a Feature

Use this when a feature needs a query to return something new or filter differently. A pure performance rewrite with identical results is a refactor: hand it to `backend-refactor`.

1. Read the current query, its indexes, and its callers.
2. Keep the existing repository interface or signature unless the change is intentional, and list every caller you change.
3. Keep the query persistence-only. Business decisions stay in services. Keep it parameterized and owner-scoped per `<shared>/sql-safety.md`; a new filter or sort input goes through an allowlist, a list through array binding, and a search term through an escaped, bound LIKE.
4. Run integration tests against a provably local database (Testcontainers or a local container) or a close test double.
5. To check the plan, run plain `EXPLAIN` first. `EXPLAIN ANALYZE` executes the statement: for INSERT, UPDATE or DELETE wrap it in `BEGIN; ... ROLLBACK;`, and run it only against a provably local database.
6. If the query needs a new index, hand the index to `backend-migrate`.
7. Update callers only if the return shape changes.
