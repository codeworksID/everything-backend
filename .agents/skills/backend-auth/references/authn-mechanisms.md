# AuthN Mechanisms and Decision Trees

Read this when choosing how callers authenticate, or when the client type is unclear.

## Build vs Buy

Prefer a managed identity provider or a maintained framework module over hand-built login code.

- **Buy / host an IdP** (managed IdP, or self-hosted such as Keycloak) when you need social login, enterprise SSO (SAML/OIDC), SCIM provisioning, MFA, or passkeys, or the team has no auth specialist.
- **Use the framework's auth module** (e.g. Django auth, Spring Security, a maintained Node/Python library) for a single first-party app with email + password.
- **Build custom** only for the thin glue: session or token verification, the authorization gate, tenant scoping. Never write your own crypto, password hashing, or token signing.
- Record the choice and its reason in `decisions.md`.

## Mechanisms

### Sessions (server-side state)
- **When**: server-rendered apps, same-domain SPAs with a backend-for-frontend (BFF).
- **Pros**: easy revocation, opaque to clients, no token parsing.
- **Cons**: needs a shared session store when scaled out; less portable to mobile and third parties.
- **Storage**: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict` cookie holding only a session ID.
- **Hardening**: see `tokens-and-sessions.md` -> Session hardening, and CSRF in `security-defaults.md`.

### Tokens (JWT or opaque)
- **When**: stateless APIs, SPAs, mobile, microservices.
- **Pros**: self-contained, horizontally scalable, easy to pass across services.
- **Cons**: pure JWT revocation is hard; payload grows; clock skew matters.
- **Storage**: `HttpOnly` cookie for first-party web; Keychain/Keystore on mobile; never `localStorage` for sensitive tokens.
- **Details**: `tokens-and-sessions.md`.

### OAuth 2.0 / OIDC
- **When**: users sign in with an external IdP, or third-party apps need delegated access.
- **Defaults**: authorization-code flow with PKCE (S256). Never the implicit flow or the password grant for new code.
- **Client checklist** (OAuth 2.0 Security BCP, RFC 9700):
  - Generate a random `state` per request and compare it on callback (login CSRF). For OIDC also send and check `nonce` in the ID token.
  - Register exact redirect URIs; never use wildcard or prefix matching; never redirect to a URL taken from the request.
  - Validate the ID token like any JWT: signature via the IdP JWKS, `iss`, `aud` = your client ID, `exp`, `nonce`.
  - Link accounts by the pair (`iss`, `sub`), never by email alone. Link by email only if the IdP marks the email verified and the user proves control of the existing account.
  - Keep the client secret server-side only; public clients (SPA, mobile) use PKCE without a secret.
  - Request the minimum scopes.

### Enterprise SSO
- SAML 2.0 or OIDC per customer tenant; map the IdP to the tenant by verified domain or explicit configuration, never by a user-entered value.
- Use SCIM for provisioning and deprovisioning; on deprovision, revoke sessions and refresh tokens.

### API Keys
- **When**: machine-to-machine, service accounts, public API products.
- **Never**: for human user login.
- **Defaults**: generate at least 128 random bits with a visible prefix (e.g. `sk_live_`) for secret scanning; show once; store only a hash (SHA-256 is fine for high-entropy keys); per-key scopes, expiry, last-used timestamp, and revocation.
- **Webhook signing secrets are different**: HMAC verification needs the raw secret, so store it encrypted (KMS or secret manager), not hashed. Verify the signature on the raw request body before parsing, compare in constant time, reject old timestamps, and dedupe by event ID.

## Decision Trees

### Public API consumed by third parties
1. API keys scoped per consumer, or OAuth client credentials for larger platforms.
2. Keys hashed and revocable in the database.
3. Rate limits per key.
4. HTTPS only; no cookies, so no CSRF surface.

### Single-page application (SPA)
1. BFF or same-site API.
2. Short-lived access token or session ID in an `HttpOnly` cookie.
3. Refresh-token rotation with reuse detection.
4. CSRF protection, because credentials are in cookies.

### Mobile application
1. OAuth 2.0 + PKCE, or opaque refresh tokens.
2. Secure device storage (Keychain / Keystore).
3. Biometric unlock of the stored token where appropriate.
4. Remote logout by revoking refresh tokens.

### Microservices
1. End-user identity carried in a short-lived JWT.
2. Service-to-service identity via mTLS or scoped service tokens.
3. Each service verifies tokens independently with the issuer's public keys from a cached JWKS. Never share an HS256 secret across services.
4. Centralize user/session lookup only where needed.

### Admin / ERP dashboard
1. Session cookies with strong flags, CSRF protection, ID regeneration, idle and absolute timeouts.
2. RBAC with an explicit permission matrix.
3. MFA required for admin roles.
4. Audit log for privileged actions.
