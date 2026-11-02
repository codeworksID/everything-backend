# Feature Patterns

Contract-level patterns for common features. Each section says what to put in the contract; implementation goes to `backend-implement`, storage to `backend-db-design`, and infrastructure to `backend-ops`.

## Authentication Endpoints

Do not design login, signup, refresh, logout or password reset endpoints here. `backend-auth` chooses the mechanism (server sessions, JWT access plus refresh tokens, OAuth/OIDC with an external provider) and the endpoints follow from it. In this skill:

- Mark each endpoint public, authenticated, owner-only or role-restricted.
- Note the ownership or tenant check for every `/{id}` route.
- List admin actions and sensitive state changes that need audit logging.
- If no auth decision is recorded in `decisions.md` or `api-patterns.md`, hand off to `backend-auth` before implementation.

A `GET /me` (or `/users/me`) endpoint for the current caller's profile is usually useful and fits any mechanism.

## File Upload

Prefer direct-to-storage uploads with presigned URLs over streaming files through the API:

1. `POST /uploads` with `{filename, contentType, size}`. The server checks the type against an allowlist and the size against a limit, then returns `{uploadId, url, fields, expiresAt}` for a presigned PUT or POST with a short expiry (minutes) and a size condition.
2. The client uploads straight to object storage.
3. `POST /uploads/{uploadId}/complete` (or a storage event) marks it done. The server then checks the real content (magic bytes, not the extension or client `Content-Type`), optionally scans it for malware, and only then links it to the owning resource.

Rules:
- Buckets are private. Serve files through short-lived signed GET URLs or an authorized download endpoint.
- Generate storage keys server-side (for example `tenant/{tenantId}/{uuid}`); never use the client filename as the key.
- Serve user files with `Content-Disposition: attachment` and the stored content type, ideally from a separate domain, so uploaded HTML or SVG cannot run as your site.
- Set lifecycle rules to delete uploads that were never completed.
- If uploads must pass through the API (`multipart/form-data`), set a hard request size limit and stream to storage instead of buffering in memory.

## Real-Time (WebSocket and SSE)

Choose:
- Server-Sent Events (`GET /events`, `text/event-stream`): server-to-client only, works over plain HTTP, reconnects automatically.
- WebSocket (`/ws`): two-way messages.
- GraphQL subscriptions: when the API is already GraphQL.

Contract rules:
- Authenticate the handshake. Browsers cannot set custom headers on WebSocket, so use the session cookie plus an Origin check, or a short-lived single-use ticket from an authenticated `POST /ws-tickets` passed as a query parameter. Never put long-lived tokens in the URL.
- Check the `Origin` header against an allowlist on every WebSocket handshake (prevents cross-site WebSocket hijacking).
- Authorize each subscription or channel join, not just the connection.
- Define message types as a schema (a `type` field plus payload), and version them like any API.
- SSE: give each event an `id` and support resume with the `Last-Event-ID` header.
- Set limits: max message size, max subscriptions per connection, and a policy for slow consumers (drop or disconnect when the send buffer fills).
- Flag to `backend-ops`: fan-out across instances (pub/sub), heartbeats, and draining connections on deploy.

## Search

- `GET /{resource}?q=term` with the normal filters, sort and pagination.
- Allowlist searchable fields and set a `maxLength` on `q` (for example 100) in the spec. `q` is plain text, not a query language: no field operators, boolean syntax or regex unless the design defines a small grammar the server parses into bound values.
- `%` and `_` in `q` match literally; the server escapes them and binds the value (`_shared/sql-safety.md` rule 6). For a search engine, the server builds a structured query and never passes `q` into `query_string` or a script (rule 9).
- Return a relevance score only if clients use it; sort by relevance when `q` is present unless `sort` is given.
- Back it with a full-text index (database full-text search or a search engine); flag the index for `backend-db-design`.

## Bulk Operations

- `POST /{resource}/batch` (or `:batchCreate`-style for gRPC) with an array and a max item count (for example 100) as `maxItems` in the spec. Ids in the array use the typed `Id` schema with `uniqueItems: true`.
- Bulk update and delete take an explicit id list, never a filter expression ("delete where ..."). Every item is checked against the caller's tenant or ownership; the server binds the list as an array plus the owner (`_shared/sql-safety.md` rules 3-5).
- Decide and document: all-or-nothing (one transaction, any failure fails all) or per-item results.
- Per-item results return 200 (or 207 if the project uses it) with one entry per input: `{"results": [{"index": 0, "status": 201, "data": {...}}, {"index": 1, "status": 422, "error": {...}}]}`.

## Long-Running Operations

For work that takes longer than a normal request timeout (exports, imports, video processing):

1. `POST /exports` returns 202 Accepted with `Location: /operations/{operationId}` and `{"operationId": "...", "status": "pending"}`.
2. `GET /operations/{operationId}` returns `{"status": "pending" | "running" | "succeeded" | "failed", "result": {...}, "error": {...}}`.
3. Optionally notify by webhook when done.

Operations are owned by the caller; apply the same access check as the resource.

## Inbound Webhooks

When third parties call your API (payment providers, Git hosts):

- Verify the provider's signature on the raw request body before parsing JSON. Register the raw-body route before any global JSON body parser.
- Check the signed timestamp and reject old deliveries (replay protection).
- Deduplicate by the provider's event ID; return 2xx for a duplicate without reprocessing.
- Acknowledge quickly (2xx) and queue the work; providers retry on timeouts.
- The webhook signing secret must be stored retrievable (encrypted), not hashed, because it is used to compute HMACs.
- Record the conventions in the Webhooks section of `api-patterns.md`.

Outbound webhooks (your API calling consumers): sign each delivery, deliver from an outbox with retries, and validate target URLs as below.

## User-Supplied URLs

Any field where a client gives a URL the server will fetch (webhook targets, image import, link previews) is an SSRF risk:

- Allow only `https` (and `http` only if required).
- Resolve the hostname and reject private, loopback, link-local and cloud metadata addresses (for example `169.254.169.254`); re-check after redirects, or disable redirects.
- Set timeouts and a max response size.
- Prefer an allowlist of domains when the use case allows it.
