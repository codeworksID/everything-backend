# REST Conventions

Use these defaults when the project has no convention of its own. If `api-patterns.md` or an existing spec already defines a convention, follow it instead.

## Paths

- Nouns, plural, lowercase: `/users`, `/orders`, `/products`.
- Kebab-case for multi-word segments: `/team-members`, `/order-items`.
- Nest at most one level: `/users/{id}/orders`. Link deeper relations by ID.
- Actions that are not CRUD become a sub-resource with POST: `POST /orders/{id}/cancel`. Use this sparingly; prefer a state change on the resource when it fits (`PATCH /orders/{id}` with `{"status": "cancelled"}`) only if the transition has no side effects beyond the field.
- Path parameters use `{name}` in OpenAPI. Frameworks write them as `:id`, `{id}` or `<id>`; the spec uses `{id}`.
- Base path carries the major version for URL versioning: `/api/v1`. See `versioning.md`.

## Endpoint Template

```
GET    /api/v1/{resource}               # List (paginated)
POST   /api/v1/{resource}               # Create
GET    /api/v1/{resource}/{id}          # Get one
PUT    /api/v1/{resource}/{id}          # Replace (all writable fields)
PATCH  /api/v1/{resource}/{id}          # Partial update
DELETE /api/v1/{resource}/{id}          # Delete

GET    /api/v1/{parent}/{id}/{resource} # List children of a parent
POST   /api/v1/{parent}/{id}/{resource} # Create a child under a parent

POST   /api/v1/{resource}/{id}/{action} # Non-CRUD action
```

Only include the operations the requirements need. Do not add PUT and PATCH both by reflex.

## Methods and Status Codes

| Method | Safe | Idempotent | Success codes |
|---|---|---|---|
| GET | yes | yes | 200, 304 (conditional GET) |
| POST (create) | no | no (use Idempotency-Key) | 201 with `Location` header, or 202 for async work |
| POST (action) | no | no | 200 with result, 202 for async, 204 with no body |
| PUT | no | yes | 200 with body, or 204 |
| PATCH | no | not guaranteed | 200 with body, or 204 |
| DELETE | no | yes | 204; a repeat DELETE returns 204 or 404, document which |

Error status codes and the error body are in `errors.md`.

## JSON Casing

Pick one casing for JSON fields and query parameters and use it everywhere. Default: camelCase for JavaScript and TypeScript consumers (`createdAt`, `pageSize`), snake_case when the project already uses it (common with Python and Ruby). Never mix them in one API. Record the choice under Conventions in `api-patterns.md`.

## Data Formats

- Timestamps: RFC 3339 strings in UTC with an explicit offset (`2026-11-02T09:30:00Z`).
- IDs: strings in JSON, even when the database uses integers, so the ID type can change later.
- Money: integer minor units plus a currency code (`{"amount": 1999, "currency": "EUR"}`), or a decimal string. Never a float.
- Enums: lowercase strings; document every value.
- Error messages for humans can be localized via `Accept-Language`; machine-readable error codes never change with language.

## Request Bodies

- Each create and update operation has its own schema listing only client-writable fields. Reject or ignore unknown fields, and document which (rejecting with 422 is safer).
- Never bind the request body straight onto a database model. Server-owned fields (`id`, `role`, `ownerId`, `tenantId`, `createdAt`, `updatedAt`, workflow status) are set by the server.
- Set limits: maximum body size per endpoint (a small default such as 1 MB for JSON), string `maxLength`, array `maxItems`.
- Validate at the boundary; reject malformed input with 422. Encode output for its context (HTML, SQL, shell) instead of "sanitizing" input.

## PATCH Semantics

Pick one and document it:

- JSON Merge Patch (RFC 7396), media type `application/merge-patch+json`: send only the fields to change; `null` clears a field. Simple, and the default choice. It cannot express array element edits.
- JSON Patch (RFC 6902), media type `application/json-patch+json`: a list of operations (`add`, `remove`, `replace`, `test`). Use when clients must edit arrays or need atomic test-and-set.

Many APIs accept plain `application/json` with merge semantics. That is fine if the spec says so.

## Pagination

Choose one style per API. Do not mix fields from both.

Cursor pagination (default for lists that grow, feeds, and anything over roughly 10K rows):

- Request: `?limit=20&cursor=<opaque>`. `limit` has a default (20) and a maximum (100).
- Response: `{"data": [...], "page": {"nextCursor": "...", "hasMore": true}}`. `nextCursor` is null on the last page.
- The cursor encodes the sort key plus a unique tiebreaker (usually the ID), for example `(createdAt, id)`. Order by both columns and index them together.
- Treat the cursor as opaque (base64 of the key values); validate it and return 400 for a malformed cursor.
- No total count by default. `COUNT(*)` on large tables is slow; offer it only when a consumer needs it and the table is small or the count is cached.

Offset pagination (admin tables that need "jump to page N" on small or medium data):

- Request: `?page=1&pageSize=20`, with a maximum `pageSize`.
- Response: `{"data": [...], "page": {"page": 1, "pageSize": 20, "totalItems": 532, "totalPages": 27}}`.
- Always sort by a stable key with a unique tiebreaker, or rows repeat or vanish between pages.

Optional for either style: a `Link` header (RFC 8288) with `rel="next"` and `rel="prev"`.

## Filtering and Sorting

- Filters are query parameters named after fields: `?status=active&createdAfter=2026-01-01T00:00:00Z`.
- Sorting: `?sort=createdAt` ascending, `?sort=-createdAt` descending. Allowlist the sortable fields; each needs an index.
- Reject unknown filter or sort fields with 400 rather than silently ignoring them.

## Optimistic Concurrency

Use for resources that several users or processes edit:

1. GET returns an `ETag` header (a version number or a hash of the representation).
2. PUT, PATCH and DELETE require `If-Match: <etag>`.
3. If the ETag no longer matches, return 412 Precondition Failed. If `If-Match` is missing where it is required, return 428 Precondition Required.

Back the ETag with a version column (see `backend-db-design` for optimistic locking at the data layer).

## HTTP Caching

- Authenticated or per-user responses: `Cache-Control: private, no-store` by default, so no shared cache or CDN stores one user's data and serves it to another.
- Truly public resources (same for every caller): `Cache-Control: public, max-age=<seconds>`; add `Vary` for every request header that changes the response (`Accept`, `Accept-Encoding`, `Accept-Language`).
- If a response varies by `Authorization` or `Cookie`, it is not public. Do not put it behind a shared cache.
- Conditional GET: return an `ETag`; on a matching `If-None-Match`, return 304 with no body.

## Idempotency Keys

For POSTs where a retry must not create a second effect (payments, orders, sends):

1. The client sends `Idempotency-Key: <unique string, e.g. a UUID>`.
2. The server stores the key with the caller identity, a hash of the request body, the response status and body, and an expiry (for example 24 hours).
3. Same key and same body after completion: replay the stored response.
4. Same key with a different body: 422.
5. Same key while the first request is still running: 409.
6. Keys are scoped per caller, so one client cannot replay another's response.

The storage table goes to `backend-db-design`; the middleware goes to `backend-implement`.
