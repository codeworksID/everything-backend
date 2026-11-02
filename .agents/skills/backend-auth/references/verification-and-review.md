# Verification, Review Checklist and Output Templates

Read this when writing the negative-test matrix, running review mode, or producing the design document and memory entries.

## Negative-Test Matrix

Every auth change ships with these tests where the feature applies. Each must fail (be rejected) for the right reason and with the right status. Hand writing and running them to `backend-test` with this table as input.

| Area | Case | Expected |
|---|---|---|
| Token | Missing token on a protected route | 401 |
| Token | Expired token (`exp` in the past beyond leeway) | 401 |
| Token | `nbf` in the future | 401 |
| Token | Bad signature / signed with a different key | 401 |
| Token | `alg: none`, and HS256 token signed with the RSA/EC public key | 401 |
| Token | Wrong `iss`; wrong `aud` | 401 |
| Token | Unknown `kid` (no JWKS refetch storm) | 401, at most one JWKS fetch per cooldown |
| Token | ID token used as access token (when `typ` is enforced) | 401 |
| Token | Denylisted `jti`, or `iat` before `tokens_valid_after` | 401 |
| Refresh | Reuse of a rotated refresh token | 401 and the whole family revoked |
| Session | Session ID unchanged after login (fixation) | new session ID issued; the pre-login ID no longer authenticates |
| Session | Idle and absolute timeout exceeded | 401 / redirect to login |
| Session | Request after logout with the old cookie | 401 |
| CSRF | State-changing request without a CSRF token or with a cross-site `Origin` | 403 |
| AuthZ | Role without the permission | 403 |
| AuthZ | User A reads, lists, updates, deletes user B's resource (same tenant) | 403 or 404 |
| Tenancy | Tenant A principal accesses tenant B resource by ID | 404 |
| Tenancy | Client sends another `tenant_id` in body, query, or header | ignored or 403 |
| Tenancy | Tenant B rows absent from tenant A list endpoints | no leakage |
| Tenancy | Tenant A principal updates or deletes tenant B's row by ID | 404, and tenant B's row count and values unchanged |
| Injection | Hostile id, filter, sort, or search values on an owner-scoped endpoint (payload list in `<shared>/sql-safety.md` -> Verification, item 4) | 400 or own-tenant rows only; never extra rows, a 500, or a changed row count |
| Injection | Login or reset body with an operator object or array where a string is expected (`{"email": "a@b.c", "password": {"$ne": null}}`) | 400, never a session |
| Injection | Login email `' OR '1'='1' --` | same 401 as a wrong password |
| Mass assignment | Client sets `role` / `tenant_id` / `is_admin` in an update body | field ignored or 400 |
| Credentials | Wrong password and unknown user return identical status and body | same response |
| Credentials | Password shorter than policy, or on the breached list | 400 / 422 |
| Brute force | Repeated failures | 429 with `Retry-After`, then temporary lock |
| Reset | Reset token reused or expired | rejected |
| MFA | Disabling MFA without recent re-authentication | 401 / 403 |
| Headers | Token endpoint response | has `Cache-Control: no-store` |

Positive tests too: valid token passes, correct role passes, owner can access own resource.

The Injection and cross-tenant rows apply `<shared>/sql-safety.md` -> Verification, item 4 to auth. Run them against every endpoint that takes an id, filter, sort, or free-text parameter on tenant- or user-owned data, not just the auth routes.

## Review Checklist (review mode)

Inspect code and config, and record evidence (file:line) for each item:

1. Every protected route has authentication; no route is accidentally public.
2. JWT verification pins algorithms and checks `iss`, `aud`, `exp`, `nbf`; JWKS by `kid` from configured URL only.
3. Secrets: HS secrets of at least 256 bits from a secret manager; no keys in source, images, or logs.
4. Refresh rotation with reuse detection; revocation path exists.
5. Cookies: `HttpOnly`, `Secure`, `SameSite`, `__Host-` where possible; CSRF protection for cookie credentials.
6. Session ID regenerated on login and privilege change; idle and absolute timeouts.
7. Passwords hashed with argon2id/scrypt/bcrypt before persistence; bcrypt 72-byte limit handled; no plaintext in logs.
8. Login, signup, and reset do not enumerate accounts.
9. Rate limiting on auth endpoints with a shared store and trusted-proxy IP resolution.
10. Ownership and tenant checks in services; `tenant_id` only from the principal; RLS session handling safe on pools.
11. Every by-id read, update, and delete on tenant- or user-owned data binds the owner predicate from the principal in the same statement, with bound parameters (`<shared>/sql-safety.md` -> The Rules, rules 1 and 3). Read every repository/DAO file the auth gate relies on; record each query without the predicate.
12. DTO field allowlists prevent setting roles or tenant.
13. CORS allowlist; auth responses `no-store`; HSTS.
14. Audit logs for auth events without secrets.
15. Existing tests cover the negative matrix above.

## Finding Format

Use the same shape as `backend-doctor` so findings merge cleanly:

```markdown
### [Severity] Short title
- **Category**: Security / auth
- **File**: path/to/file.ts:42
- **Evidence**: what the code does
- **Impact**: what an attacker can do
- **Fix**: concrete change
- **Next skill**: backend-auth | backend-implement | backend-migrate | backend-test
```

Severity: **Critical** = auth bypass, forged tokens accepted, cross-tenant access, secrets exposed, or a query without the owner predicate or built from strings with untrusted input that a public or low-privilege endpoint reaches (`<shared>/sql-safety.md` -> Verification, item 5). **High** = missing ownership check, no CSRF on cookie auth, no rate limit on login, weak hashing. **Medium** = missing timeouts, missing `no-store`, enumeration. **Low** = hardening and hygiene.

## Design Document Template

```markdown
# Auth Design: <feature or system>

## Principals and Clients
## AuthN Mechanism (and why)
## Token / Session Design (lifetimes, storage, rotation, revocation, keys)
## Credential Flows (password policy, recovery, MFA)
## AuthZ Model (roles, permission matrix, ownership, tenancy)
## Security Defaults Applied (CSRF, headers, CORS, rate limits)
## Schema Changes (handed to backend-db-design / backend-migrate)
## Negative-Test Matrix (rows that apply)
## Open Questions
```

## decisions.md Entry

```markdown
## [YYYY-MM-DD HH:MM] Auth: <mechanism> for <scope>

### Context
Principals, clients, threat model, constraints.

### Decision
Mechanism; token or session lifetimes and storage; signing algorithm and key location; role model; tenancy enforcement.

### Consequences
Trade-offs, revocation behavior, follow-ups.

### Alternatives Considered
Rejected options and why.

### Status
Accepted
```

## api-patterns.md -> Authentication

Short and factual, for other skills to consume:

```markdown
### Authentication
- Mechanism: session cookie (`__Host-sid`) for web; Bearer JWT (ES256, 15 min) for mobile
- Verification: jose jwtVerify, iss=https://auth.example.com, aud=orders-api, JWKS cached
- CSRF: synchronizer token header `X-CSRF-Token` on state-changing requests
- AuthZ: RBAC matrix in src/auth/permissions.ts; ownership and tenant checks in services
- Tenancy: tenant_id from principal only; RLS on tenant tables
```
