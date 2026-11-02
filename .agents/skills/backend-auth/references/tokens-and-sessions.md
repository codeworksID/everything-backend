# Tokens and Sessions

Read this when designing or writing JWT/opaque token handling, refresh rotation, revocation, key rotation, or server-side sessions. The non-negotiable verification rules are also summarized in SKILL.md; this file holds the detail and per-library calls. For framework wiring, see the matching file in `<shared>/stacks/`.

## JWT Claims

Include only what services need:
- `sub`: user or service-account ID
- `iss`: issuer; `aud`: intended audience(s)
- `iat`, `exp`, `nbf`: issued-at, expiry, not-before
- `jti`: unique token ID for denylisting
- Small custom claims: `roles`, `tenant_id`
- Never secrets or sensitive data: a signed JWT is base64url-encoded, not encrypted.

```json
{
  "sub": "user_123",
  "iss": "https://auth.example.com",
  "aud": "orders-api",
  "iat": 1710000000,
  "exp": 1710000900,
  "jti": "tok_abc",
  "tenant_id": "t_42",
  "roles": ["member"]
}
```

## JWT Verification

Verify locally with a maintained library on every request. Never decode-and-trust or hand-roll signature checks.

1. **Pin algorithms server-side.** Pass an explicit allowlist; never accept `none`; never let the token header choose the algorithm or key type. Bind each key to one algorithm so an RSA/EC public key is never used as an HMAC secret (alg confusion).
2. **Verify every claim**: signature, `iss` (exact match), `aud` (contains this service), `exp` (required), `nbf` (if present). Clock-skew leeway of 60 seconds or less.
3. **Token type**: when the issuer sets `typ: at+jwt` (RFC 9068), require it, so an OIDC ID token is never accepted as an access token.
4. **`kid` and JWKS**: look up `kid` only in the JWKS fetched from a configured URL. Ignore `jku`, `x5u`, and `jwk` header values. Cache the JWKS. On an unknown `kid`, refresh once with a cooldown (at most one refetch per 30-60 s), then reject.
5. **Keys**: prefer ES256, EdDSA, or RS256 (2048-bit or larger) whenever any service other than the issuer verifies tokens; only the issuer holds the private key. Use HS256 only when issuer and verifier are the same service, with a secret of at least 256 bits from a CSPRNG (not a passphrase), loaded from a secret manager.
6. **Failures**: map every verification failure to 401 with a generic message. Log the reason server-side, never the token.

### Library calls

| Stack | Call |
|---|---|
| Node (`jose`) | `jwtVerify(token, keyOrJwks, { algorithms: ['ES256'], issuer, audience, clockTolerance: '30s' })` |
| Python (PyJWT) | `jwt.decode(token, key, algorithms=["ES256"], issuer=..., audience=..., leeway=30, options={"require": ["exp", "iss", "aud", "sub"]})` |
| Go (golang-jwt v5) | `jwt.Parse(token, keyFunc, jwt.WithValidMethods([]string{"ES256"}), jwt.WithIssuer(iss), jwt.WithAudience(aud), jwt.WithExpirationRequired(), jwt.WithLeeway(30*time.Second))` |
| Java | Spring Security resource server or Nimbus JOSE+JWT with an explicit `JWSAlgorithm` set and claim verifier |

JWKS caching notes:
- `jose` `createRemoteJWKSet` caches keys and rate-limits refetches (`cooldownDuration`, default 30 s).
- PyJWT `PyJWKClient` caches the key set (`lifespan`) but refetches on every unknown `kid`. Wrap it with your own cooldown, or reject unknown kids between refreshes.

## Lifetimes

| Token | Lifetime |
|---|---|
| Access token | 5-15 minutes (stays valid until `exp` unless denylisted) |
| Refresh token | 7-90 days, or the session lifetime |
| Password-reset / magic-link | 15-60 minutes, single use |
| Email verification | up to 24 hours, single use |

## Opaque Tokens

Use opaque tokens (random ID looked up server-side) when you need instant revocation, metadata changes often, or you want a lookup gate at a service boundary. Store only a hash of the token.

## Refresh Rotation

- Issue a new refresh token on every refresh.
- Invalidate the previous one in the same transaction.
- Store family ID, token hash (never the raw token), expiry, and revoked flag server-side.
- Reuse detection: if an already-rotated refresh token is presented, treat it as theft, revoke the whole family, and force re-login.
- Allow a short grace window (a few seconds) only if concurrent client refreshes are a real problem, and log it.

## Revocation

- Urgent revocation before expiry (compromised account, admin action): add the `jti` to a denylist (e.g. Redis) with TTL equal to the token's remaining lifetime; check it on every verification.
- Opaque and refresh tokens: delete or mark revoked in the datastore.
- Revoke everything on password change, MFA change, or suspicious activity: revoke every refresh-token family for the user, and either denylist outstanding access tokens or reject tokens whose `iat` is before a per-user `tokens_valid_after` timestamp.

## Token Storage

- **First-party web**: `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict` cookie; set `Path`; prefer the `__Host-` prefix.
- **SPA on a separate API site**: `SameSite=None; Secure` only if unavoidable, and then a CSRF token is mandatory. Prefer a same-site architecture or a BFF.
- **Mobile**: Keychain / Keystore.
- **Never**: `localStorage` or `sessionStorage` for sensitive tokens in production web apps.

## Signing Key Rotation

1. Generate the new key pair in the secret manager or KMS.
2. Publish the new public key in the JWKS before signing with it.
3. Start signing with the new `kid`.
4. Keep the old public key in the JWKS until every token it signed has expired, then remove it.

## Session Hardening

- Session IDs: at least 128 bits from a CSPRNG (framework stores do this by default). Never accept a client-chosen ID.
- Regenerate the session ID on login and on any privilege change (role change, MFA step-up, sudo mode) to prevent fixation.
- Enforce an idle timeout (e.g. 15-30 minutes for admin or sensitive apps) and an absolute timeout (e.g. 8-24 hours) server-side, not only through cookie `Max-Age`.
- Cookie: `__Host-` prefix (requires `Secure`, `Path=/`, no `Domain`), plus `HttpOnly` and `SameSite`.
- Logout destroys the session server-side (or revokes the refresh-token family), then clears the cookie. Clearing the cookie alone is not logout.
- Password change or reset invalidates all of the user's other sessions.
- Store sessions in a shared store (database or Redis) when running more than one instance.
