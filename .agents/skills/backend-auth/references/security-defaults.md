# Auth Security Defaults

Read this when hardening an auth flow: rate limiting, headers, CORS, CSRF, and secrets. Apply `<shared>/principles.md` -> Security first; these are the auth-specific defaults.

## Rate Limiting and Brute Force

- Rate-limit login, signup, password reset, MFA verification, and token refresh. Key by account identifier and by client IP separately.
- Use a shared store (e.g. Redis) when running more than one instance; per-instance memory limits are bypassed by load balancing.
- Resolve the client IP only from a trusted proxy chain (configure the number of trusted hops); never trust a raw `X-Forwarded-For`.
- Prefer progressive delay or temporary lockout (e.g. exponential backoff, then a 15-minute lock). Never lock accounts permanently on failed attempts: that lets attackers lock out victims. Notify the user on lockout.
- Return 429 with `Retry-After`. Add CAPTCHA or proof-of-work only after abuse thresholds.

## Transport and Headers

- HTTPS everywhere except local development. `Strict-Transport-Security: max-age=31536000; includeSubDomains` (add `preload` only deliberately).
- Auth responses (login, token, refresh, user profile, reset): `Cache-Control: no-store`.
- `Content-Security-Policy: frame-ancestors 'none'` (or a specific allowlist) for clickjacking; keep `X-Frame-Options: DENY` for older browsers.
- `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (or `no-referrer` on pages with tokens in URLs).
- Never put tokens in URLs or query strings except one-time codes that are exchanged immediately.

## CORS

- Exact-match allowlist of known origins.
- Never `*` with credentials, never reflect the request `Origin`, never allow the `null` origin.
- Turn `Access-Control-Allow-Credentials` on only where cookies must cross origins.

## CSRF Protection

Required whenever the browser attaches credentials automatically: session cookies, JWTs in cookies, HTTP Basic.

- Baseline: `SameSite=Lax` or `Strict` on auth cookies. With `Lax`, GET still rides top-level navigations, so GET must never change state. SameSite does not stop same-site attackers (e.g. a compromised sibling subdomain).
- On every state-changing request (POST, PUT, PATCH, DELETE) add one of:
  - **Synchronizer token**: per-session random token stored server-side, sent in a header or form field, compared in constant time.
  - **Signed double-submit cookie**: token HMAC-bound to the session ID. A plain, unsigned double-submit cookie can be bypassed by cookie injection.
  - **Origin verification**: reject when `Sec-Fetch-Site` is `cross-site`, or when `Origin` (falling back to `Referer`) is not in the allowlist; reject when both are missing.
- `SameSite=None` cookies must use a CSRF token (synchronizer or signed double-submit), not SameSite alone.
- Protect the login form too (login CSRF).
- Prefer the framework's built-in protection (Django `CsrfViewMiddleware`, Spring Security CSRF). The `csurf` npm package is deprecated; do not use it.
- APIs that take credentials only from an `Authorization: Bearer` header set by client code are not exposed to CSRF and need no CSRF token, but CORS must not allow credentials for arbitrary origins.

## Secrets and Configuration

- Load signing keys, peppers, and client secrets from a secret manager (directly, or injected as environment variables at deploy time). Never from source or image layers.
- HS256 secrets: at least 256 bits from a CSPRNG. Prefer asymmetric keys whenever services other than the issuer verify tokens.
- Rotate signing keys with overlap (see `tokens-and-sessions.md` -> Signing Key Rotation).
- Never commit secrets or test credentials. `.env.example` holds names only.
- Editing `.env*` or key files is Always Ask First (see `<shared>/tool-rules.md`).
