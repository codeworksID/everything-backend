---
name: backend-auth
description: Designs, implements and hardens authentication and authorization for backend services, covering sessions, JWT and opaque tokens, OAuth 2.0/OIDC and SSO, API keys, password hashing, account recovery, MFA, RBAC/ABAC, tenant isolation, CSRF and session hardening. Writes the auth core (verifier, middleware, authorization gate), records the auth decision in project memory, and defines the negative tests that prove it. Use when the user says auth, authentication, authorization, login, sign up, sign in, logout, session, JWT, refresh token, OAuth, OIDC, SSO, SAML, SCIM, API key, MFA, 2FA, passkey, WebAuthn, password reset, CSRF, roles, permissions, RBAC, access control, multi-tenant access, or asks to review or harden an existing auth flow.
---

# Backend Auth

Owns how callers prove who they are (AuthN) and what they may do (AuthZ). It designs the mechanism, writes the auth core code, persists the decision, and hands the negative-test matrix to `backend-test`.

## When to Use

- Designing or choosing login, sessions, tokens, OAuth/OIDC, SSO, or API keys.
- Writing or fixing token verification, auth middleware, password flows, MFA, or the authorization gate.
- Defining roles, permissions, ownership, or tenant isolation.
- Reviewing or hardening an existing auth flow (review mode, below).

Not this skill:
- A broad security review (OWASP API Top 10, secret scanning, SAST, supply chain): use `backend-security`. It hands auth fixes back here.
- Writing or applying migrations for user, token, or RLS tables: design with `backend-db-design`, write and apply with `backend-migrate`.
- Feature endpoints that merely need "logged-in user" checks: `backend-implement`, consuming the auth contract this skill records.
- An auth bug with a known symptom (e.g. "login returns 500"): `backend-debug`, which may call this skill for the fix design.

## Modes

- **Design** (default): new or changed auth. Produces a design, code for the auth core, memory entries, and a test matrix.
- **Review**: triggered by "review", "audit", "harden", or "is our auth safe". Read-only until the user approves fixes. Infers principals and mechanisms from code instead of asking, runs the checklist, and reports findings.

`mode=auto` and `mode=interactive` follow `<shared>/tool-rules.md` -> `mode=auto` Contract. This skill never redefines it.

## Before You Start

1. Resolve the shared docs folder (`<shared>`): first `_shared/` inside this skill's folder (bundled installs, e.g. Claude.ai), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, checkpoints) and `<shared>/host-tools.md` if the action names below don't map clearly to your host's tools. Read `<shared>/principles.md` -> Security. If it is missing, warn once and use this skill's Non-Negotiable Rules as the baseline.
3. Load project memory per `<shared>/context-loading.md`: `project-overview.md`, `tech-stack.md`, `api-patterns.md` (existing auth conventions), and `db-schema.md` (user and membership tables). Load `decisions.md` for prior auth decisions and `issues.md` in review mode. If memory is empty, run `backend-scan` first when possible; otherwise continue from the manifest and code.
4. If the detected stack matches a file in `<shared>/stacks/` (e.g. `node-typescript.md`, `python-fastapi.md`, `postgres.md`), read it for library and framework wiring.

## Workflow

### 1. Confirm scope

- **Design mode**: establish who the principals are (human users, service accounts, third-party apps, or a mix) and which clients call the API (web, SPA, mobile, other services). First infer them from the request, memory, and code. If they still cannot be inferred, ask one batched question and stop until it is answered; in `mode=auto` this is a Pause for ambiguity, not a per-step prompt.
- **Review mode**: do not block. Infer principals and clients from code and config, state the inference, and continue.
- Name a feature slug (e.g. `feature=auth-login`) for checkpoints.

Output: principals, clients, tenancy model (single or multi-tenant), and mode.

### 2. Inspect what exists

- Find files: auth middleware, guards, decorators, user and membership models, session config, token issuers, protected routes, CORS and cookie config.
- Search file contents for: `jwt`, `jose`, `jsonwebtoken`, `PyJWT`, `passport`, `session`, `cookie`, `bcrypt`, `argon2`, `csrf`, `authorize`, `permission`, `role`, `tenant`, `X-Tenant`, `set_config`.
- Read the existing auth contract in `api-patterns.md` -> Authentication and any auth entries in `decisions.md`. Reuse what exists; propose changes as diffs, not rewrites.

Output: inventory of current mechanism, libraries, and gaps (file:line).

### 3. Choose the AuthN mechanism

| Client / need | Default |
|---|---|
| Server-rendered app, same-site SPA, admin dashboard | Server-side session in a hardened cookie, or a BFF |
| Mobile, third-party clients, stateless APIs | Short-lived access JWT + rotated opaque refresh token |
| Sign-in with external IdP, delegated access | OAuth 2.0 / OIDC authorization code + PKCE |
| Enterprise customers | SSO (OIDC or SAML) + SCIM via an IdP |
| Machine-to-machine, public API product | Scoped, hashed, revocable API keys, or OAuth client credentials |
| Service-to-service inside a platform | mTLS or scoped service tokens; verify user JWTs locally via JWKS |

Prefer a managed IdP or the framework's auth module over custom login code; never write your own crypto.

Output: mechanism with rationale.

### 4. Design tokens, sessions and credentials

Apply the Non-Negotiable Rules below. Decide and write down: lifetimes, storage, signing algorithm and key location, refresh rotation, revocation path, session timeouts, password policy, recovery flow, MFA scope.

Output: token/session design and credential-flow decisions.

### 5. Design authorization

- One placement rule: middleware authenticates and may apply coarse route-level role/permission gates; services enforce tenant, ownership, and fine-grained permissions on the loaded resource.
- One authorization gate answers "can this principal do this action on this resource?"
- Roles map to permissions in one matrix. In multi-tenant systems roles are tenant-scoped.
- Request DTOs allowlist fields; clients can never set `role`, `tenant_id`, or ownership through generic updates.

Output: AuthZ model (RBAC/ABAC/ownership), permission matrix, tenancy enforcement.

### 6. Hand off schema changes

User, session, refresh-token, reset-token, MFA, API-key, membership tables, indexes, `tenant_id` columns and RLS policies are schema changes. Describe them (see `references/credentials.md` -> Identity Tables) and hand them to `backend-db-design` for the model and `backend-migrate` to write and apply. This skill never writes or applies migrations.

Output: schema handoff list.

### 7. Write the auth core (design mode)

In `mode=interactive`, show the design and wait for the user to accept it. In `mode=auto`, continue unless a Pause for ambiguity applies (e.g. two reasonable mechanisms with different security trade-offs and nothing in the request or memory to choose between them).

Start a checkpoint before the first edit: `node <shared>/scripts/checkpoint.js start --skill backend-auth --feature <slug>`. Record each file you create or edit (`checkpoint.js record`), snapshot after each step, and close it when done. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand. If `start` exits with code 3, offer the user resume or restart.

Write, in this order, using the stack file for library calls:
1. Token/session verification module (Non-Negotiable Rules).
2. `authenticate` middleware: attach the verified principal or continue as anonymous; invalid token -> 401; infrastructure errors propagate as 5xx. `requireAuth`, `requireRole` / `requirePermission`.
3. Password hashing and verify (with rehash and dummy-hash), recovery, MFA, as in scope.
4. Authorization gate and tenant-scoped repository helpers.
5. Security defaults: CSRF, cookie flags, headers, CORS, rate limits.
6. Audit logging for auth events.

Feature endpoints that use these pieces belong to `backend-implement`. Editing `.env*`, key files, or CI config is Always Ask First.

Output: changed files list, recorded in the checkpoint.

### 8. Persist the decision

- Append an entry to `decisions.md` (format: `references/verification-and-review.md` -> decisions.md Entry). Mark a replaced auth decision Deprecated with `Superseded by`.
- Update `api-patterns.md` -> Authentication with the short auth contract (mechanism, verification parameters, CSRF method, where AuthZ lives, tenancy rule). `backend-implement`, `backend-test`, and `backend-security` read it.
- Update `tech-stack.md` -> Auth with the libraries used.
- Follow `<shared>/memory-schema.md` formats; record memory files in the checkpoint (`--memory`).

Output: memory entries written.

### 9. Verify

1. Run the project's type-check, lint, and build; check LSP diagnostics if available. Fix errors in files this run touched.
2. Build the negative-test matrix from `references/verification-and-review.md`, keeping only rows that apply, and hand it to `backend-test` to write and run. Do not mark failing tests skipped or loosen them (`<shared>/tool-rules.md` -> Test Integrity).
3. Close the checkpoint: `node <shared>/scripts/checkpoint.js close --skill backend-auth --feature <slug>`.

Done when:
- Build, lint, and type-check pass for touched files.
- Tests exist and pass for, at minimum: expired, forged-signature, `alg: none`, wrong-`iss` and wrong-`aud` tokens rejected with 401; a user denied another user's resource; a tenant A principal denied tenant B's resource (404) including a spoofed `tenant_id`; a cookie-authenticated state-changing request without a valid CSRF token rejected (403); refresh-token reuse revoking the family (if refresh tokens exist); identical responses for unknown user and wrong password.
- `decisions.md` and `api-patterns.md` -> Authentication are updated.
- Schema changes are handed to `backend-migrate`, not applied here.

If tests cannot run (no test setup, non-local targets per Production Targets), report the matrix as pending and say so; do not claim done.

### Review mode workflow

1. Steps 1-2 above, inferring principals.
2. Walk the review checklist in `references/verification-and-review.md` and record evidence (file:line) for every item.
3. Report findings in the doctor-compatible format, with severity and **Next skill**. Log each Medium or higher finding in `issues.md` (format: `<shared>/memory-schema.md` -> issues.md). This memory write needs a checkpoint like any other file write (`--feature auth-review`, record with `--memory`).
4. Ask before fixing. Approved fixes follow steps 6-9 with a checkpoint.
5. For anything beyond auth (injection, SSRF, dependencies, secrets in history), hand off to `backend-security`.

Done when every checklist item has evidence or "not applicable", findings are reported and logged, and no source or config file was changed without approval.

## Non-Negotiable Rules

These hold in every mode and every stack. Detail and per-library calls: `references/tokens-and-sessions.md`.

**JWT verification**
- Verify with a maintained library on every request; never decode-and-trust.
- Pin an explicit algorithm allowlist server-side; never accept `none`; never let the header pick the algorithm; never use an RSA/EC public key as an HMAC secret.
- Verify signature, `iss` (exact), `aud` (contains this service), `exp` (required), `nbf` (if present), leeway 60 s or less. Require `typ: at+jwt` when the issuer sets it.
- Resolve `kid` only from a configured JWKS URL; ignore `jku`, `x5u`, `jwk` headers; cache keys; on unknown `kid` refetch at most once per cooldown, then reject.
- Asymmetric keys (ES256, EdDSA, RS256 2048+) whenever anyone but the issuer verifies. HS256 only within one service, secret of at least 256 bits from a CSPRNG, from a secret manager. Never share an HS secret across services.
- Short access tokens (5-15 min). Revocation path: `jti` denylist or per-user `tokens_valid_after`; refresh rotation with reuse detection that revokes the family.
- Every verification failure is a 401 with a generic message; log the reason, never the token.

**Credentials**
- Hash passwords with argon2id (or scrypt; bcrypt with the 72-byte limit handled) before they are persisted or logged. Store only hashes of refresh, reset, verification, and API-key tokens. Webhook HMAC secrets are encrypted, not hashed, because verification needs them.
- Password policy per NIST SP 800-63B rev. 4: 15 characters minimum as a single factor (8 with MFA), accept 64+, breached-list check, no forced composition or rotation.
- No account enumeration in login, signup, or reset.

**Sessions and browser credentials**
- Cookies: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`, `__Host-` prefix where possible. Never sensitive tokens in `localStorage`.
- Regenerate the session ID on login and privilege change; enforce idle and absolute timeouts server-side; logout destroys server state.
- CSRF protection (synchronizer token, signed double-submit, or strict Origin/`Sec-Fetch-Site` checks) on every state-changing request whenever the browser sends credentials automatically. `SameSite=None` requires a CSRF token. GET never changes state.
- Auth responses send `Cache-Control: no-store`. CORS uses an exact allowlist; never `*` or reflected origins with credentials.

**Authorization and tenancy**
- `tenant_id` and user identity come only from the verified principal, never from body, query, or headers unless membership is checked server-side.
- Every query on tenant-owned data is tenant-filtered (scoped repository or RLS with transaction-local `set_config`); cross-tenant lookups return 404.
- Roles are tenant-scoped; platform operator roles are separate, MFA-protected, and audited.
- Rate-limit auth endpoints with a shared store; use temporary or progressive lockout, never permanent.

## Output Format

Design mode returns:
1. Principals, clients, and tenancy model.
2. AuthN mechanism with rationale.
3. Token/session design: lifetimes, storage, keys, rotation, revocation.
4. Credential flows: password policy, recovery, MFA.
5. AuthZ model: roles, permission matrix, ownership, tenancy enforcement.
6. Security defaults applied.
7. Schema handoff list for `backend-db-design` / `backend-migrate`.
8. Files changed (from the checkpoint) and memory entries written.
9. Negative-test matrix and its status (passing, pending in `backend-test`).
10. Next step.

Review mode returns the findings list (severity-ordered, with evidence and next skill) and the checklist coverage.

## Handoffs

| To | When |
|---|---|
| `backend-db-design` -> `backend-migrate` | Any identity, token, membership, or RLS schema change |
| `backend-implement` | Feature endpoints that consume the auth contract |
| `backend-test` | Writing and running the negative-test matrix |
| `backend-security` | Full security review, secret scanning, SAST, dependencies |
| `backend-debug` | A reproducible auth bug outside a design change |
| `backend-ops` / `backend-deploy` | Secret manager wiring, key rotation schedule, JWKS hosting |

## References

- `references/authn-mechanisms.md`: read when choosing a mechanism, configuring an OAuth/OIDC client, SSO/SCIM, API keys or webhook secrets, or deciding build vs buy.
- `references/tokens-and-sessions.md`: read when writing JWT verification, refresh rotation, revocation, signing-key rotation, token storage, or session hardening.
- `references/credentials.md`: read when building signup, login, password hashing, password policy, account recovery, MFA, or the identity tables to hand off.
- `references/authorization.md`: read when designing roles, permission matrices, ownership checks, tenant isolation/RLS, mass-assignment protection, or writing auth middleware.
- `references/security-defaults.md`: read when adding rate limiting, security headers, CORS, CSRF protection, or secret handling.
- `references/verification-and-review.md`: read when building the negative-test matrix, running review mode, or writing the design doc and memory entries.
