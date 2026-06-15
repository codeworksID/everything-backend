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

## Context Loading

Before proposing an auth design, inspect the real codebase and memory:

1. **`read`** `.opencode/everything-backend-memory/tech-stack.md` for current auth choices (JWT / OAuth / Session)
2. **`read`** `.opencode/everything-backend-memory/api-patterns.md` for existing authentication conventions
3. **`read`** `.opencode/everything-backend-memory/decisions.md` for prior auth architecture decisions
4. **`glob`** and **`read`** existing auth middleware, user models, and protected routes
5. **`grep`** for patterns like `bcrypt`, `jwt`, `passport`, `session`, `authorize`, `permission`, `role`

If memory is empty or stale, suggest running `backend-scan` first.

## AuthN Design

Choose the mechanism that matches the client and threat model.

### Sessions (server-side state)
- **When**: traditional server-rendered apps, same-domain SPAs with a backend-for-frontend
- **Pros**: easy revocation, opaque to clients, no token parsing logic
- **Cons**: needs sticky sessions or shared session store; less portable to mobile/third-party
- **Storage**: `httpOnly`, `Secure`, `SameSite=Lax|Strict` cookie with a session ID

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
- `iat`, `exp`: issued-at and expiration
- `jti`: unique token ID for revocation lists
- Custom claims: `roles`, `permissions`, `tenant_id` (keep small)

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

### Expiration guidelines
- Access tokens: 5–60 minutes
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
- Invalidate the previous refresh token (detect reuse = likely theft)
- Store refresh-token family and expiration server-side

### Revocation
- Maintain a blocklist of `jti` + `exp` for JWTs you want to revoke before expiry
- For opaque/refresh tokens, delete or mark revoked in the datastore
- Revoke all tokens on password change, MFA enrollment, or suspicious activity

### Token storage
- **First-party web**: `httpOnly`, `Secure`, `SameSite=Lax|Strict` cookies; set `Path` and consider `__Host-` prefix
- **SPAs with separate API domain**: same-site `None` + `Secure` only if needed; prefer same-site architecture
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

```typescript
// Example ownership check
if (resource.ownerId !== currentUser.id && !currentUser.isAdmin()) {
  throw new ForbiddenError();
}
```

### Permission checks
- Prefer a single authorization service/gate that knows roles, policies, and ownership
- Controllers ask "can this user do this action on this resource?"
- Keep business logic out of middleware; middleware only enforces "is authenticated"

## Implementation Steps

### 1. User identity model
- Store: id, email (unique, verified), password_hash, MFA secret (encrypted), lockout state, timestamps
- Add indexes on email and any lookup used during login

### 2. Registration and login endpoints
- Validate and normalize email
- Hash password
- Issue tokens or create session
- Return consistent errors whether the user exists or not to prevent enumeration where acceptable

### 3. Middleware design
- `authenticate`: validate token/session and attach `currentUser` / `currentSession`
- `requireAuth`: reject anonymous requests
- `requireRole(role)` / `requirePermission(permission)`: RBAC gate

```typescript
// Example middleware shape
async function authenticate(req, res, next) {
  const token = extractBearerOrCookie(req);
  const session = await verifyToken(token);
  req.context = { currentUser: session.user };
  next();
}
```

### 4. Current-user injection
- Pass `currentUser` through request context to services
- Services perform ownership and permission checks
- Do not trust client-sent user IDs

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
- Restrict allowed origins to known domains
- Do not use `*` with credentials
- Keep `Access-Control-Allow-Credentials` intentional, not default-on

### Secrets and configuration
- Read signing keys, pepper values, and client secrets from environment variables
- Rotate signing keys periodically and support key IDs (`kid`) in JWT headers
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
3. Refresh token rotation
4. CSRF protection if using cookie-based sessions

### Mobile application
1. OAuth 2.0 + PKCE or opaque refresh tokens
2. Secure device storage (Keychain / Keystore)
3. Biometric lock where appropriate
4. Remote logout by revoking refresh tokens

### Microservices
1. End-user identity carried in short-lived JWT
2. Service-to-service identity via mTLS or scoped service tokens
3. Each service validates signature/audience independently
4. Centralize user/session lookup only where needed

### Admin / ERP dashboard
1. Session cookies with strong flags
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
