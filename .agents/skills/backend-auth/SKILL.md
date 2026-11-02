---
name: backend-auth
description: "Design and implement authentication and authorization for backend projects. Owns session/token/OAuth flows, JWT design, password handling, MFA, RBAC/ABAC, and secure defaults. Use this skill when the user says 'auth', 'authentication', 'authorization', 'OAuth', 'JWT', 'RBAC', 'login', 'session', 'sign in', 'sign up', 'permissions', 'roles', or 'access control'."
---

# Backend Auth

## When to Activate

- User wants to design or implement authentication or authorization
- User says "auth", "authentication", "authorization", "OAuth", "JWT", "RBAC"
- User asks about login, signup, sessions, tokens, permissions, or roles
- Starting a new feature that requires identity or access control
- Reviewing or hardening an existing auth flow

## Prerequisites

See `_shared/context-loading.md` for standard prerequisites (project root check, manifest detection, shared file presence, memory directory check, fallback rules, and context priority list).

Auth-specific prerequisites on top of the standard set:

- **REQUIRED**: `_shared/principles.md` loaded, **Security section mandatory**
  - Check: resolve `_shared/principles.md` as described in `_shared/context-loading.md` → Resolving `_shared/` Files (sibling of this skill's folder first), and verify the `## Security` section is present
  - If missing: warn once and continue with this skill's own rules; do not stop. This skill's JWT verification, Security Defaults, CSRF protection, and Session hardening sections are then the security baseline.
- **REQUIRED**: identity/authorization scope is confirmed (human users, service accounts, OAuth, etc.)
  - Check: ask the user "Who is the principal: human users, service accounts, or both?" and confirm a non-empty answer
  - If missing: stop before proceeding

## Required Context

Follow the standard context priority list in `_shared/context-loading.md` with these auth-specific overrides:

- **Load `_shared/principles.md` first**, Security section mandatory. This is load-bearing for auth work.
- Load `api-patterns.md` at priority 4 (useful for discovering existing auth conventions)
- Skip `issues.md` unless reviewing risks

## Context Loading

Before proposing an auth design, supplement the standard context loading with auth-specific codebase inspection:

1. **`glob`** and **`read`** existing auth middleware, user models, and protected routes
2. **`grep`** for patterns like `bcrypt`, `jwt`, `passport`, `session`, `authorize`, `permission`, `role`

## AuthN Design

Choose the mechanism that matches the client and threat model.

### Sessions (server-side state)
- **When**: traditional server-rendered apps, same-domain SPAs with a backend-for-frontend
- **Pros**: easy revocation, opaque to clients, no token parsing logic
- **Cons**: needs sticky sessions or shared session store; less portable to mobile/third-party
- **Storage**: `httpOnly`, `Secure`, `SameSite=Lax|Strict` cookie with a session ID
- **Hardening**: regenerate the ID on login, set idle and absolute timeouts, add CSRF protection (see Session hardening and CSRF protection)

### Token-based (JWT / opaque)
- **When**: stateless APIs, SPAs, mobile, microservices
- **Pros**: self-contained, horizontally scalable, easy to pass across services
- **Cons**: revocation is hard with pure JWT; payload size grows; clock skew matters
- **Storage**: prefer `httpOnly` cookies for first-party web; secure storage for mobile

### OAuth 2.0 / OIDC
- **When**: users sign in via Google/GitHub/etc., or third-party apps need delegated access
- **Pros**: delegates credential risk, standardized consent, refresh tokens
- **Cons**: protocol complexity; misconfigured flows leak data or allow account takeover
- **Defaults**: use authorization-code flow with PKCE; never use implicit flow for new code

### API Keys
- **When**: machine-to-machine, service accounts, webhooks, public API products
- **Pros**: simple, easy to rotate per consumer
- **Cons**: long-lived keys are high-impact if leaked; never use for user login
- **Defaults**: store only a hash of the key; allow per-key scopes and revocation

## Token Design

### JWT claims
Include only what the service needs:
- `sub`: user or service account ID
- `iss`: issuer
- `aud`: intended audience(s)
- `iat`, `exp`, `nbf`: issued-at, expiration, not-before
- `jti`: unique token ID for revocation lists
- Custom claims: `roles`, `permissions`, `tenant_id` (keep small)
- Never put secrets or sensitive data (PII beyond the subject ID, internal flags) in the payload: a signed JWT is base64url-encoded, not encrypted

```typescript
// Example access token payload (short-lived)
{
  "sub": "user_123",
  "iss": "my-api",
  "aud": "my-api",
  "iat": 1710000000,
  "exp": 1710003600,
  "jti": "tok_abc",
  "roles": ["user"]
}
```

### JWT verification
Every service that accepts a JWT verifies it locally with a maintained library (`jose` for Node, PyJWT for Python, `github.com/golang-jwt/jwt/v5` for Go, Spring Security / Nimbus JOSE+JWT for Java). Never decode-and-trust or hand-roll signature checks.

- **Pin algorithms server-side**: pass an explicit allowlist and never accept `none`. Never let the token header choose the algorithm or key type; each key is bound to one algorithm, so an RSA/EC public key is never accepted as an HMAC secret (alg confusion).
  - `jose`: `jwtVerify(token, key, { algorithms: ['ES256'], issuer, audience, clockTolerance: '30s' })`
  - PyJWT: `jwt.decode(token, key, algorithms=["ES256"], issuer=..., audience=..., leeway=30, options={"require": ["exp", "iss", "aud", "sub"]})`
  - golang-jwt v5: `jwt.Parse(token, keyFunc, jwt.WithValidMethods([]string{"ES256"}), jwt.WithIssuer(iss), jwt.WithAudience(aud), jwt.WithExpirationRequired(), jwt.WithLeeway(30*time.Second))`
- **Verify every claim**: signature, `iss` (exact match), `aud` (contains this service), `exp` (required), `nbf` (if present), with clock-skew leeway of 60 seconds or less.
- **Token type**: when the issuer sets `typ: at+jwt` (RFC 9068), require it, so an OIDC ID token is never accepted as an API access token.
- **`kid` and JWKS**: look up `kid` only in the issuer's JWKS fetched from a configured URL, never from `jku`, `x5u`, or `jwk` header values. Cache the JWKS. On an unknown `kid`, refresh once with a rate limit (e.g. at most one refetch per 30-60 s), then reject. `jose` `createRemoteJWKSet` caches and rate-limits refetches (`cooldownDuration`, default 30 s). PyJWT `PyJWKClient` caches the JWK set (`lifespan`) but refetches on every unknown `kid`, so wrap it with your own cooldown or reject unknown kids between refreshes.
- **Keys**: prefer asymmetric algorithms (ES256, EdDSA, or RS256 with 2048-bit or larger keys) whenever any service other than the issuer verifies tokens; only the issuer holds the private key. Use HS256 only when the issuer and the verifier are the same service, with a secret of at least 256 bits from a CSPRNG (not a passphrase), loaded from a secret manager.
- **Failures**: map every verification failure to 401 with a generic message; log the reason server-side without the token.

### Expiration guidelines
- Access tokens: 5–15 minutes (short, because a JWT stays valid until `exp` unless denylisted)
- Refresh tokens: 7–90 days, or single-session lifetime
- Password-reset / magic-link tokens: 15–60 minutes
- Email-verification tokens: 24 hours

### Opaque tokens
Use opaque tokens when:
- You need instant revocation
- Token metadata changes often
- Tokens cross service boundaries where you want a lookup gate

### Refresh rotation
- Issue a new refresh token on every access-token refresh
- Invalidate the previous refresh token in the same transaction
- Store refresh-token family, hash (never the raw token), and expiration server-side
- Reuse detection: if an already-rotated refresh token is presented, treat it as theft and revoke the whole family, forcing re-login

### Revocation
- High-risk revocation before expiry (compromised account, admin action): add the `jti` to a denylist (e.g. Redis) with a TTL equal to the token's remaining lifetime, checked on every verification
- For opaque/refresh tokens, delete or mark revoked in the datastore
- Revoke all tokens on password change, MFA enrollment, or suspicious activity: revoke every refresh-token family for the user and either denylist outstanding access tokens or reject tokens issued before a per-user `tokens_valid_after` timestamp checked against `iat`

### Token storage
- **First-party web**: `httpOnly`, `Secure`, `SameSite=Lax|Strict` cookies; set `Path` and consider `__Host-` prefix
- **SPAs with separate API domain**: same-site `None` + `Secure` only if needed, and then CSRF protection is mandatory (see CSRF protection); prefer same-site architecture
- **Mobile**: Keychain / Keystore
- **Never**: localStorage for sensitive tokens in production web apps

## Password & Credential Flows

### Password hashing
- Use **argon2id**, **bcrypt**, or **scrypt** with library defaults tuned for your hardware
- Never roll your own hashing or use MD5/SHA1/SHA256 for passwords
- Hash once on the server; never log plaintext passwords

```python
# Example: argon2id with a trusted library
from argon2 import PasswordHasher
ph = PasswordHasher()
hash = ph.hash(password)
ph.verify(hash, password)
```

### Password policy
- Minimum 8–12 characters; encourage passphrases
- Check against breached-password lists (e.g., Have I Been Pwned)
- Do not force excessive rotation or arbitrary complexity rules
- Provide clear strength feedback at signup

### Account recovery
- Send time-limited, single-use, random tokens (not JWTs)
- Hash the token in the database
- Invalidate existing tokens when a new one is issued
- Confirm the reset only after the user submits a new password

### MFA / TOTP basics
- Offer TOTP (authenticator apps) or WebAuthn/passkeys for sensitive accounts
- Store TOTP secrets encrypted; never return them after enrollment
- Provide backup codes, hash them, and invalidate after use
- Require recent authentication before enabling or disabling MFA

## AuthZ Design

### RBAC (Role-Based Access Control)
- Define roles as coarse buckets: `admin`, `editor`, `viewer`, `service`
- Map roles to permissions in one place
- Check roles at route/middleware level and permissions inside services

### ABAC / fine-grained
- Use attributes: user department, resource owner, subscription tier, time of day
- Good for complex multi-tenant or compliance-heavy systems
- Harder to reason about; document policies explicitly

### Resource ownership
- Always verify the actor owns or is explicitly granted access to the resource
- Do not rely solely on route params; re-check in the service layer
- In multi-tenant systems, check the tenant first, then owner or role

```typescript
// Example tenant-scoped ownership check (service layer)
// principal comes from the verified token/session, never from the body, query, or headers
const resource = await repo.findById(principal.tenantId, id); // query filters by tenant_id
if (!resource || resource.tenantId !== principal.tenantId) {
  throw new NotFoundError(); // do not reveal that another tenant's resource exists
}
// principal.roles are tenant-scoped claims (see the authenticate middleware below)
if (resource.ownerId !== principal.userId && !principal.roles.includes('admin')) {
  throw new ForbiddenError();
}
```

### Tenant isolation
- Take `tenant_id` only from the authenticated principal (verified token claim or server-side session). Ignore tenant IDs in the body, query, or headers such as `X-Tenant-ID`, unless the server checks that the principal is a member of that tenant
- Filter every query on tenant-owned tables by `tenant_id` through a tenant-scoped repository, or enforce it with Postgres row-level security. With RLS, set the tenant at the start of each transaction with the parameterized `SELECT set_config('app.tenant_id', $1, true)` (`true` = transaction-local, like `SET LOCAL`; `SET` cannot take bind parameters, so never build it by string interpolation), and write policies as `tenant_id = current_setting('app.tenant_id', true)::uuid` so a missing setting yields NULL and matches no rows. Never use session-level `SET` on pooled connections. Superusers and `BYPASSRLS` roles skip RLS, and table owners do unless `FORCE ROW LEVEL SECURITY` is set, so the app must not connect as any of them
- Roles are tenant-scoped: an admin in tenant A has no rights in tenant B. Keep any platform-wide operator role separate, MFA-protected, and audited
- Add negative tests: a user in tenant A cannot read, list, update, or delete tenant B's resources
- RLS policies and `tenant_id` columns are schema changes: hand them to `backend-migrate`

### Permission checks
- Prefer a single authorization service/gate that knows roles, policies, and ownership
- Controllers ask "can this user do this action on this resource?"
- Keep business logic out of middleware; middleware only enforces "is authenticated"

## Implementation Steps

### 1. User identity model
- Store: id, email (unique, verified), password_hash, MFA secret (encrypted), lockout state, timestamps
- Add indexes on email and any lookup used during login
- Schema changes (user, token, MFA and lockout tables, indexes, RLS policies) are designed with `backend-db-design` and written and applied only by `backend-migrate`; this skill does not write or apply migrations

### 2. Registration and login endpoints
- Validate and normalize email
- Hash password
- Issue tokens or create session
- Return consistent errors whether the user exists or not to prevent enumeration where acceptable

### 3. Middleware design
- `authenticate`: validate token/session and attach the verified principal (user ID, tenant ID, roles)
- `requireAuth`: reject anonymous requests
- `requireRole(role)` / `requirePermission(permission)`: RBAC gate

```typescript
// Example middleware shape
// Express 5 forwards rejected promises to the error middleware; Express 4 does not,
// so keep the try/catch + next(err) there (or wrap the handler).
async function authenticate(req, res, next) {
  try {
    const token = extractBearerOrCookie(req);
    if (!token) return next(); // anonymous; requireAuth rejects it later
    const claims = await verifyAccessToken(token); // algorithm allowlist, iss, aud, exp/nbf (see JWT verification)
    req.context = {
      principal: { userId: claims.sub, tenantId: claims.tenant_id, roles: claims.roles },
    };
    next();
  } catch (err) {
    // Invalid or expired token -> 401; infrastructure errors (e.g. JWKS fetch) -> error middleware
    next(isTokenVerificationError(err) ? new UnauthorizedError() : err);
  }
}
```

### 4. Current-user injection
- Pass the principal through request context to services
- Services perform tenant, ownership, and permission checks
- Do not trust client-sent user or tenant IDs

### 5. Protected routes
- Apply authentication middleware at route level
- Apply authorization at service or handler level
- Document auth requirements in API specs

### 6. Audit logging for auth events
- Log: login success/failure, logout, password change, MFA enable/disable, token refresh, suspicious reuse
- Include: timestamp, user ID, IP, user agent, outcome
- Exclude: passwords, tokens, secrets

## Security Defaults

Apply the security principles in `_shared/principles.md` to every auth flow, then apply these auth-specific defaults unless there is a justified exception.

### Rate limiting and brute-force protection
- Rate-limit login, signup, password reset, and token refresh by identifier + IP
- Implement account lockout or exponential backoff after repeated failures
- Use CAPTCHA or proof-of-work only after abuse thresholds

### Transport and headers
- Require HTTPS in all environments except local development
- Use `Secure`, `httpOnly`, `SameSite` cookie attributes
- Set `Strict-Transport-Security`, `X-Content-Type-Options`, `X-Frame-Options`

### CORS
- Restrict allowed origins to an exact-match allowlist of known domains
- Do not use `*` with credentials, never reflect the request `Origin` back, and never allow the `null` origin
- Keep `Access-Control-Allow-Credentials` intentional, not default-on

### CSRF protection
Required whenever the browser attaches credentials automatically: session cookies, JWTs in cookies, HTTP Basic.
- Baseline: `SameSite=Lax` or `Strict` on auth cookies. With `Lax`, GET still rides top-level navigations, so GET must never change state. SameSite does not stop same-site attackers (e.g. a compromised sibling subdomain)
- On every state-changing request (POST, PUT, PATCH, DELETE), add one of:
  - Synchronizer token: per-session random token stored server-side, sent in a header or form field, compared in constant time
  - Signed double-submit cookie: token HMAC-bound to the session ID. A plain, unsigned double-submit cookie can be bypassed by cookie injection
  - Origin verification: reject when `Sec-Fetch-Site` is `cross-site`, or when `Origin` (falling back to `Referer`) is not in the allowlist; reject when both headers are missing
- `SameSite=None` cookies must use a CSRF token (synchronizer or signed double-submit), not SameSite alone
- Protect the login form too (login CSRF)
- Prefer the framework's built-in protection (Django `CsrfViewMiddleware`, Spring Security CSRF). The `csurf` npm package is deprecated; do not use it
- APIs that take credentials only from an `Authorization: Bearer` header set by client code are not exposed to CSRF and need no CSRF token, but CORS must not allow credentials for arbitrary origins

### Session hardening
- Session IDs: at least 128 bits from a CSPRNG (framework session stores do this by default); never accept a client-chosen ID
- Regenerate the session ID on login and on any privilege change (role change, MFA step-up, sudo mode) to prevent session fixation
- Enforce an idle timeout (e.g. 15–30 minutes for admin or sensitive apps) and an absolute timeout (e.g. 8–24 hours) server-side, not only through cookie `Max-Age`
- Name session cookies with the `__Host-` prefix (requires `Secure`, `Path=/`, and no `Domain`) plus `HttpOnly` and `SameSite`
- On logout, destroy the session server-side (or revoke the refresh-token family), then clear the cookie; clearing the cookie alone is not logout
- On password change or reset, invalidate all of the user's other sessions

### Secrets and configuration
- Load signing keys, pepper values, and client secrets from a secret manager (directly or injected as environment variables at deploy time); never from source or image layers
- HS256 secrets: at least 256 bits from a CSPRNG. Prefer asymmetric keys (RS256, ES256, EdDSA) whenever services other than the issuer verify tokens (see JWT verification)
- Rotate signing keys periodically: publish the new public key in the JWKS before signing with it, sign with a new `kid`, and keep the old key until all tokens it signed have expired
- Never commit secrets or test credentials

## Decision Trees

### Public API consumed by third parties
1. API keys scoped per consumer
2. Keys hashed and revocable in database
3. Rate limits per key
4. HTTPS only; no cookies

### Single-Page Application (SPA)
1. Backend-for-frontend or same-site API
2. Short-lived access token in `httpOnly` cookie
3. Refresh token rotation with reuse detection
4. CSRF protection, because the credentials are in cookies (see CSRF protection)

### Mobile application
1. OAuth 2.0 + PKCE or opaque refresh tokens
2. Secure device storage (Keychain / Keystore)
3. Biometric lock where appropriate
4. Remote logout by revoking refresh tokens

### Microservices
1. End-user identity carried in short-lived JWT
2. Service-to-service identity via mTLS or scoped service tokens
3. Each service verifies tokens independently with the issuer's public keys from a cached JWKS (see JWT verification); never share an HS256 secret across services
4. Centralize user/session lookup only where needed

### Admin / ERP dashboard
1. Session cookies with strong flags, CSRF protection, ID regeneration, and idle/absolute timeouts (see Session hardening)
2. RBAC with explicit permission matrix
3. MFA required for admin roles
4. Audit log for privileged actions

## Output Format

When the user asks for auth design, produce:

1. **Recommended AuthN mechanism** with rationale
2. **Token/session design** with expiration and storage
3. **Password/credential flow** decisions
4. **AuthZ model** (RBAC, ABAC, ownership)
5. **Implementation outline** (middleware, protected routes, audit)
6. **Security defaults checklist**
7. **Next concrete step** for the user or offer to generate code with `backend-implement`
