---
name: backend-api-design
description: "Designs API contracts before code is written: resources, endpoints, request and response schemas, error format, pagination, versioning and per-endpoint authorization rules. Writes the contract to an OpenAPI spec (docs/api/openapi.yaml by default, or the existing spec) and records conventions in api-patterns.md memory. REST is fully covered; GraphQL schemas and gRPC .proto contracts get basic guidance. Use when the user says 'design the API', 'what endpoints do I need', 'plan routes', 'write an OpenAPI spec', 'Swagger', 'define the API contract', 'design a GraphQL schema', 'write a proto file', 'add an endpoint to the spec', or 'version or deprecate an endpoint'. Not for writing handler code (backend-implement), choosing the login mechanism or auth endpoints (backend-auth), or reviewing API security (backend-security)."
---

# Backend API Design

Design the contract first. This skill produces a reviewed API contract and the memory entries that downstream skills consume. It does not write handler code.

Coverage: REST and OpenAPI are fully covered. GraphQL and gRPC guidance is basic (schema shape, errors, limits, breaking-change checks); rely on the framework's own docs for anything deeper.

## When to Use

- The user wants to design or extend an API surface, or asks "what endpoints do I need?"
- A new feature needs endpoints, and no contract exists for them yet.
- The user wants an OpenAPI/Swagger spec, a GraphQL schema, or a `.proto` file.
- An endpoint must be versioned, changed in a breaking way, or deprecated.

Not for:
- Building the endpoints: hand off to `backend-implement` after this skill.
- Choosing the auth mechanism (sessions, JWT, OAuth) or designing login, refresh and logout endpoints: that is `backend-auth`. This skill records only which endpoints need auth and which role or ownership rule applies.
- Security review of an existing API: `backend-security`.
- Fixing a broken endpoint: `backend-debug`.

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, checkpoints) and `<shared>/host-tools.md` if the action names below don't match your host's tools. Read `<shared>/principles.md` -> API and Security; apply them to every endpoint. Read `<shared>/memory-schema.md` -> api-patterns.md before writing memory.
3. Load project memory per `<shared>/context-loading.md`: `project-overview.md`, `tech-stack.md`, `api-patterns.md` (conventions and endpoint inventory), `db-schema.md` (the data the API exposes), and `decisions.md` (prior protocol and versioning decisions). If memory is empty or stale, suggest running `backend-scan` first; if the user declines, continue with what the codebase shows.
4. If the detected stack matches a file in `<shared>/stacks/`, read it.
5. Read `<shared>/sql-safety.md` -> The Rules (rules 2-6 and 10 shape the contract). The contract is the first line of defense against injection and BOLA; Step 4a turns those rules into schema constraints.

## Workflow

### Step 1: Gather requirements

Ask once, in a single message, only for what memory and the request do not already answer:

1. Resources to expose (users, orders, ...) and the operations on each (CRUD, custom actions).
2. Consumers (web frontend, mobile, third party, internal service). Third-party consumers raise the bar on versioning and docs.
3. Protocol preference, if any (REST, GraphQL, gRPC).
4. Who may call each operation: public, any authenticated user, owner only, or a named role.

Confirm the resource list back: "Resources: [list]. Did I miss any?"

Stop and ask if no resource or no consumer can be identified. Do not invent a domain.

Output: a confirmed list of resources, operations, consumers and access rules.

### Step 2: Discover existing contracts and routes

Before proposing anything, look at what exists:

- Find spec files: `**/openapi*.{yaml,yml,json}`, `**/swagger*.{yaml,yml,json}`, `**/*.proto`, `**/*.graphql`, `**/*.gql`, `buf.yaml`. Skip `node_modules`, `vendor` and build output.
- Search file contents for route definitions to learn the real conventions (framework route decorators, router calls, `@app.get`, `router.`, `@GetMapping`, `HandleFunc`, resolver and service definitions).
- Compare the code with the `api-patterns.md` endpoint inventory. Note drift in either direction.

Rules:
- If a spec exists, it is the contract. Extend it in place and keep its OpenAPI version, casing, error shape and pagination style. Never write a second, competing spec.
- If code and spec disagree, report the drift and ask which one is the truth before changing either.
- If the project is code-first (the spec is generated from annotations or schemas), design in the same form the generator reads and note that the generated spec is the artifact.

Output: the contract file path to use, the conventions to follow, and any drift found.

### Step 3: Choose the protocol

Default to REST unless the project already uses another protocol or the needs clearly call for one.

| Protocol | Choose when | Watch out for |
|---|---|---|
| REST | CRUD, web and mobile clients, third-party consumers, HTTP caching matters | Over- or under-fetching, many round trips |
| GraphQL | Many clients with different data needs over one graph | N+1 queries, query cost abuse, harder HTTP caching |
| gRPC | Internal service-to-service calls, streaming, strict typed contracts | Limited browser support (needs gRPC-Web or a gateway), harder debugging |

Mixed is fine (for example REST for public clients, gRPC between services). Record a protocol choice that is new to the project in `decisions.md` in Step 7.

Output: the protocol per consumer group, with a one-line reason.

### Step 4: Design resources and endpoints

Apply `references/rest-conventions.md` (naming, methods, status codes, pagination, casing). For GraphQL use `references/graphql.md`; for gRPC use `references/grpc.md`.

For every endpoint or operation, define:

1. Method and path (or query/mutation, or RPC).
2. Path, query and header parameters, with types and limits, following Step 4a.
3. Request body schema, as an explicit allowlist of client-writable fields. Server-owned fields (`id`, `role`, `ownerId`, `createdAt`, status set by workflows) are never accepted from the body.
4. Response schema. Never return secrets, password hashes, tokens or internal fields; return PII only when the consumer needs it.
5. Error responses, using the project's error format (`references/errors.md`).
6. Access rule: who may call it, plus the ownership or tenant check for any `/{id}` resource.
7. Limits: maximum body size, maximum page size, string lengths, array lengths.
8. Retry safety: whether it is idempotent; for critical POSTs (payments, orders) require an `Idempotency-Key` header.
9. Caching: `Cache-Control` for the response. Authenticated responses default to `private, no-store`.

Feature-specific patterns (file upload, real-time, search, bulk, long-running jobs, inbound webhooks, user-supplied URLs) are in `references/feature-patterns.md`.

Output: an endpoint table with the nine items above for each endpoint.

### Step 4a: Make every input injection-proof in the contract

Any parameter a public client can send will be tried with hostile input. Constrain it in the spec so generated validators reject it at the boundary (`<shared>/sql-safety.md` rule 10: defense in depth, never the fix itself):

| Input | Contract rule | sql-safety.md |
|---|---|---|
| `sort`, `order` | `enum` of public sort keys (`createdAt`, `-createdAt`, ...); direction is `asc`/`desc` or a `-` prefix, never free text | rule 2 |
| `fields`, `include`, `expand` | array of `enum` values with `maxItems`; never a column or relation name passed through | rule 2 |
| Filters | one named parameter per allowed field, each with a type and `format`/`enum`; no generic `filter=<expression>`, `where=` or raw JSON query object | rules 2, 4, 9 |
| Ids (path, query, body) | typed: `format: uuid`, or a digit `pattern` (`^[1-9][0-9]{0,18}$`) for integer ids sent as strings | rule 1 |
| Id lists (`ids`, bulk bodies) | array of typed ids with `maxItems` (for example 100) and `uniqueItems` | rules 4, 5 |
| Search (`q`, `nameContains`) | `minLength`, `maxLength` (for example 100); document that `%` and `_` match literally | rule 6 |
| Page size (`limit`, `pageSize`, `first`) | `minimum: 1`, `maximum` (for example 100), a `default` | rule 4 |
| Cursor | `maxLength`; opaque to the client; the server decodes it, validates every key, and returns 400 when malformed | rule 1 |

Rules for the design:
- Public names are not column names. The spec names the public field (`createdAt`); the server maps it to a column through a fixed allowlist. The API layer never forwards a raw client string into a query, an ORDER BY, a column list or a NoSQL filter. Record this under Conventions in `api-patterns.md` so `backend-implement` builds the map.
- Unknown sort, filter or field values return 400 with the error format, never a silent default and never a 500.
- A `/{id}` operation's access rule (item 6) names the owner or tenant key the server binds from the authenticated principal (`sql-safety.md` rule 3). The id in the path selects the row; it does not authorize it. A row owned by someone else returns 404 (or 403, per the project convention).
- Never accept `ownerId`, `tenantId` or `userId` as a filter that widens access. A client may narrow its own results, not choose whose rows it reads.
- Error responses never echo SQL, driver messages or query text (`sql-safety.md` rule 12).

Output: every list, search and `/{id}` endpoint in the table shows its allowlisted sort/field/filter values, typed ids, page-size maximum, search length limit and owner binding.

### Step 5: Set cross-cutting conventions

Decide once per API and reuse the existing choice when there is one:

- Error format and error codes: `references/errors.md`.
- Pagination style (cursor or offset) and JSON field casing: `references/rest-conventions.md`.
- Versioning scheme, breaking-change rules and deprecation: `references/versioning.md`.
- Rate limit response: 429 with `Retry-After` (algorithm and store are an ops concern; flag them for `backend-ops`).

Output: a short conventions list that goes into `api-patterns.md`.

### Step 6: Present the design and write the contract

1. Present the endpoint table, schemas, error format, access rules and conventions. If Step 1 or Step 2 left open questions, or in `mode=interactive`, wait for approval. In `mode=auto`, continue and list any assumptions in the final report.
2. Start a checkpoint before the first edit: `node <shared>/scripts/checkpoint.js start --skill backend-api-design --feature <slug>`. Record each file you create or edit (`checkpoint.js record`), snapshot after each step, and close it when done. If the start exits with code 3, an open checkpoint exists: offer to resume it or restart. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.
3. Write the contract:
   - REST: extend the existing spec, or create `docs/api/openapi.yaml` from `references/openapi-template.md`.
   - GraphQL: the existing schema file, or `docs/api/schema.graphql`.
   - gRPC: the existing proto tree, or `proto/<package>/v1/<service>.proto`.
4. Validate the contract:
   - Every `$ref` resolves, every operation has an `operationId`, every protected operation has `security`, and every error response has a schema.
   - Step 4a holds for every parameter: no free-text `sort`/`order`/`fields`/`filter` (each is an `enum` or array of `enum`), every page-size parameter has a `maximum`, every search or free-text string has a `maxLength`, every id has a `format` or `pattern`, every array has `maxItems`. Each operation that takes these parameters lists a `400` response.
   - Run a spec linter only if it is already available in the project (for example Spectral or Redocly CLI for OpenAPI, `buf lint` for proto). Installing one is a dependency install and needs approval first (see `<shared>/tool-rules.md` -> Always Ask First). If none is available, do the checks above by reading the file.
   - Cross-check field names and types against `db-schema.md`. List any field that has no backing column or derivation, and any table the design needs that does not exist yet.
   - If an existing contract changed, classify each change as additive or breaking (`references/versioning.md`). A breaking change needs explicit user approval and a version or deprecation plan.

Output: the written contract file, lint or manual-check results, and the db-schema gap list.

### Step 7: Update memory

Update `.opencode/everything-backend-memory/` using the formats in `<shared>/memory-schema.md`:

- `api-patterns.md`: Protocol, Base Path, Authentication (the requirement per endpoint family; the mechanism comes from `backend-auth`), Conventions (casing, pagination, error shape, versioning), Error Codes, Rate Limiting, and the Endpoints inventory. The inventory is append-only; mark removed endpoints deprecated.
- `decisions.md`: one entry per new decision (protocol, versioning scheme, error format, design-first vs code-first), with context and consequences.

Record each memory file in the checkpoint (`checkpoint.js record --memory <file>`), then close it (`checkpoint.js close --skill backend-api-design --feature <slug>`).

### Step 8: Hand off

State the next skill and what it consumes:

- `backend-auth`: the auth mechanism and login, refresh, logout and password endpoints, when the design needs auth and none is recorded yet.
- `backend-db-design`: tables or columns from the db-schema gap list.
- `backend-implement`: builds the endpoints from the contract file and the endpoint table.
- `backend-test`: contract tests against the spec (status codes, error shapes, access rules) and the hostile-input negative tests in `<shared>/sql-safety.md` -> Verification, step 4, for every sort, filter, search and id parameter.
- `backend-security`: review before a public or third-party launch.

## Output

- The contract file (spec, schema or proto) at the path chosen in Step 2.
- A summary: endpoints added or changed, breaking changes (if any), open questions, db-schema gaps, and the next skill.
- Updated `api-patterns.md` and, for new decisions, `decisions.md`.

Done when:
- The contract file exists and passes the Step 6 validation (no dangling refs, every operation has an access rule and error responses).
- No parameter accepts a free-text sort, field list, filter expression or untyped id, and every page size, search string and array is bounded (Step 4a).
- Every endpoint in the contract appears in the `api-patterns.md` inventory.
- Breaking changes are either approved with a migration plan or removed.
- The checkpoint is closed and the handoff is stated.

## Edge Cases

- No clear resources: ask for two or three concrete user actions and derive resources from them; start with core CRUD.
- Complex relationships: nest one level at most (`/users/{id}/orders`); link deeper relations by ID, or consider GraphQL.
- Multiple consumers with different needs: one contract with field selection or separate read models, not one API per client. Give each consumer class its own rate limit tier if their traffic differs.
- High traffic: cursor pagination, caching headers on public reads, and a rate limit per consumer; flag capacity work for `backend-ops`.
- Legacy API: document the migration path and run both versions in parallel until the sunset date (`references/versioning.md`).
- Auth endpoints requested here: design only their place in the inventory and hand the mechanism to `backend-auth`.

## References

- `references/rest-conventions.md`: read when designing REST paths, methods, status codes, pagination, casing, PATCH semantics, concurrency (ETag/If-Match), caching or idempotency keys.
- `references/errors.md`: read when defining the error format, error codes, or headers on 401, 429 and 503.
- `references/openapi-template.md`: read when creating a new OpenAPI spec, checking that an existing one is complete, or writing sort, field, filter, search or id parameters (it has ready-made allowlisted components).
- `<shared>/sql-safety.md`: read before Step 4 and whenever a parameter feeds a query (sort, filter, search, ids, bulk).
- `references/versioning.md`: read when choosing a versioning scheme, changing an existing endpoint, or deprecating one.
- `references/feature-patterns.md`: read when the feature includes file upload, real-time (WebSocket/SSE), search, bulk operations, long-running jobs, inbound webhooks or user-supplied URLs.
- `references/graphql.md`: read when the protocol is GraphQL.
- `references/grpc.md`: read when the protocol is gRPC or the contract is a `.proto` file.
