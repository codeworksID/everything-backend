# API Contract and Auth Tests

Read this when testing endpoints, checking responses against an API spec, or testing authentication and authorization. When `backend-auth` (negative-test matrix), `backend-db-design` (tenant isolation tests) or `backend-api-design` (contract tests) hands over a table of cases, that table is the source of truth: write one test per applicable row and report each row's result.

## Endpoint Contract Tests

For each endpoint, cover at least:

- One success case: status code, response shape, and the fields the client depends on.
- Validation failure: invalid or missing input returns the documented status (often 400 or 422) and the project's error shape.
- Not found: an unknown ID returns 404 with the error shape.
- Conflict cases the API documents (duplicate unique value, version mismatch): 409 or the documented status.
- The auth cases below, when the endpoint is protected.

Test through the framework's in-process client where possible (Supertest, Fastify `inject`, httpx `ASGITransport`, `httptest`, MockMvc or `WebTestClient`, `WebApplicationFactory`). No real port or network is needed.

### Conformance to the spec

When the project has an OpenAPI (or similar) spec, check that code and spec agree:

- Validate response bodies in contract tests against the spec's schema for that operation and status code (a schema validator, or an OpenAPI response-validation helper the project already uses).
- Spec-driven fuzzing (e.g. Schemathesis) generates requests from the spec and flags 5xx errors and responses that break the schema. It runs against a running app, so it goes through the Target Check, and the app must point at local targets only.
- For services consumed by other teams, consumer-driven contracts (e.g. Pact) are an option; propose them, do not add them unasked.
- A mismatch is reported with the operation, the expected schema, and the actual response. Do not edit the spec to match the code: spec changes belong to `backend-api-design`.

## Authentication and Authorization Matrix

Write these for every protected endpoint or route group. Each test must be rejected for the right reason, with the right status, and must not leak data in the error body.

### Authentication (who are you)

| Case | Expected |
|---|---|
| No credentials | 401 |
| Malformed token or header (`Bearer` missing, garbage value) | 401 |
| Expired token | 401 |
| Token with a bad signature or signed by another key | 401 |
| Token with `alg: none`, or HS256 signed with the RSA/EC public key | 401 |
| Wrong issuer or audience | 401 |
| Revoked token, logged-out session, or reused rotated refresh token | 401 (refresh reuse also revokes the token family when the design says so) |
| Valid token | success |

Do not hand-craft tokens by copying real ones. Generate test tokens in a helper with a test-only key, and build the invalid variants from it (expired `exp`, altered payload, different key, `alg: none`).

### Authorization (what may you do)

| Case | Expected |
|---|---|
| Authenticated, but missing the required role or permission | 403 |
| User A reads, updates or deletes user B's resource by ID (BOLA / IDOR) | 404 or 403, as the API design specifies; never 200 |
| Tenant A accesses tenant B's resource by ID | 404 (or the documented status); never 200 |
| List and search endpoints | return only the caller's own or tenant's records |
| Create or update a child that references another tenant's or user's parent | rejected |
| Mass assignment: body sets `role`, `isAdmin`, `tenantId`, `ownerId` or similar | field ignored or request rejected; stored value unchanged |
| Admin-only endpoint called by a normal user | 403 |
| Function-level checks on every HTTP method of a route (e.g. GET allowed, DELETE not) | each method enforced separately |

Use two users (and two tenants for multi-tenant apps) created by factories in every authorization test file. Assert both the status and that the other user's data did not change (re-read it).

### Session and browser-facing cases (when the API uses cookies)

| Case | Expected |
|---|---|
| State-changing request without the CSRF token or with a wrong one | 403 |
| Session cookie flags | `HttpOnly`, `Secure`, and the designed `SameSite` value |
| Login with wrong password, repeated past the lockout or rate limit | 401 then 429 (or the designed lockout response); the error does not reveal whether the account exists |
| Password reset or verification token reused or expired | rejected |

## Helpers

Keep auth setup in one helper so every test uses the same path:

```typescript
export async function authHeader(user: User, overrides: Partial<Claims> = {}) {
  const token = await signTestToken({ sub: user.id, tenant: user.tenantId, ...overrides });
  return { Authorization: `Bearer ${token}` };
}
```

- The test signing key exists only in test config. It is not a real secret and must not match any deployed key.
- If the app verifies tokens through a JWKS URL, serve a local JWKS in tests (an in-process HTTP mock), never the real identity provider.
- A test that passes with auth middleware disabled proves nothing about auth. Run auth tests with the real middleware stack.
