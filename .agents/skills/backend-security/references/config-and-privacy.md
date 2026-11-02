# Configuration and Privacy Review

Read this in Steps 7 and 8. Review the configuration that production actually uses: production env files or templates, config modules keyed by environment, Helm values, Kubernetes manifests, Terraform, ingress and reverse-proxy config, Dockerfiles. Dev defaults matter only if production inherits them.

Never print secret values you see in config files; refer to them by key name.

## Configuration

Each row: what to search, and what passes. A failure is a finding mapped to API8 (Security Misconfiguration) unless noted.

### CORS

Search: `cors\(`, `Access-Control-Allow-Origin`, `CORSMiddleware`, `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_ALL`, `@CrossOrigin`, `allowedOrigins`, `AllowOrigins`.

Pass when:
- Origins are an explicit allowlist from config. `*` is acceptable only for public, unauthenticated, read-only resources.
- `Access-Control-Allow-Credentials: true` is never combined with `*` or with reflecting the request `Origin` without an allowlist check (`origin: true`, `origin: (o, cb) => cb(null, true)`, `allow_origin_regex='.*'`). That combination is **High**.
- `null` origin is not allowed.

### Security headers

Search: `helmet\(`, `secure_headers`, `SecurityMiddleware`, `SECURE_`, `Strict-Transport-Security`, `X-Content-Type-Options`, `Content-Security-Policy`, `frame-ancestors`, `X-Frame-Options`, `Referrer-Policy`, `headers\(\)` in Spring Security, ingress annotations.

Pass when, at the app or the edge:
- `Strict-Transport-Security` on HTTPS responses (with `max-age` of at least six months).
- `X-Content-Type-Options: nosniff`.
- `Cache-Control: no-store` on authenticated JSON responses that carry personal data.
- For any route that serves HTML (admin UI, docs, error pages): `Content-Security-Policy` and `frame-ancestors 'none'` (or `X-Frame-Options: DENY`).
- `X-Powered-By` and detailed `Server` headers removed (`app.disable('x-powered-by')`): **Low**.

### TLS and certificate verification

Search: `rejectUnauthorized:\s*false`, `NODE_TLS_REJECT_UNAUTHORIZED`, `verify\s*=\s*False`, `InsecureSkipVerify:\s*true`, `ssl\s*[:=]\s*false`, `sslmode=disable`, `TrustAllCerts|NoopHostnameVerifier`, `http://` URLs to third parties or internal services carrying credentials.

Pass when: certificate verification is on everywhere, HTTP redirects to HTTPS at the edge, DB connections to managed databases use TLS (`sslmode=require` or stricter), and no credentials travel over plain HTTP. Disabled verification in production code: **High**.

### Cookies

Search: `cookie\(`, `res\.cookie`, `set_cookie`, `SESSION_COOKIE_`, `CSRF_COOKIE_`, `cookie:\s*\{`, `http\.Cookie\{`, `server\.servlet\.session\.cookie`.

Pass when session and auth cookies are `Secure`, `HttpOnly`, `SameSite=Lax` or `Strict` (or `None` with `Secure` and CSRF protection when cross-site is required), scoped with the narrowest `Domain` and `Path`, and the name uses the `__Host-` prefix where possible. Missing `HttpOnly` or `Secure` on a session cookie: **High**. CSRF details belong to `backend-auth`.

### Debug modes and exposed consoles

Search: `DEBUG\s*=\s*True`, `debug\s*[:=]\s*true`, `app\.run\(.*debug=True`, `FLASK_DEBUG`, `NODE_ENV` not set to `production` in the production image, `ASPNETCORE_ENVIRONMENT=Development`, `management\.endpoints\.web\.exposure\.include=\*`, `actuator`, `/debug/pprof`, `net/http/pprof`, `swagger-ui`, `/docs`, `/redoc`, `graphiql`, `playground`, `introspection:\s*true`, `__debug__`, `django-debug-toolbar`, Werkzeug debugger.

Pass when debug mode is off in production, profilers and actuator endpoints are not public (bound to an internal port or protected), and API docs and GraphQL introspection are either disabled in production or a conscious choice for a public API (record it). An interactive debugger or console reachable in production: **Critical**.

### Error leakage

Search: error handlers (`app\.use\(\(err`, `@ExceptionHandler`, `exception_handler`, `HTTPException`, `recover\(\)`), `err\.stack`, `traceback\.format_exc`, `e\.printStackTrace`, `res\.status\(500\)\.(json|send)\(err`, `str\(e\)` returned to clients, `PROPAGATE_EXCEPTIONS`, `server\.error\.include-stacktrace`.

Pass when clients get a generic error with a correlation ID, and stack traces, SQL errors, file paths and library versions stay in server logs. Login and reset responses do not reveal whether an account exists (also API2). Stack traces to clients in production: **Medium**.

### Logging of secrets and PII

Search: log calls near sensitive names: `(log|logger|console)\.\w+\(.*(password|token|secret|authorization|cookie|card|ssn|otp)`, request logging middleware that logs full bodies or headers (`morgan\('combined'` is fine; body loggers are not), `logging\..*request\.(body|headers)`, `log\.Printf\(.*r\.Header`.

Pass when logs exclude passwords, tokens, `Authorization` and `Cookie` headers, full card numbers and secrets; PII in logs is minimized or masked; log redaction is configured (`pino` `redact`, structlog processors, Logback masking). Secrets or tokens in logs: **High**. Unmasked PII in logs: **Medium**.

### Request limits and timeouts

Covered in API4. Note the config locations (body parser, ingress `proxy-body-size`, server timeouts, DB statement timeout) in the report.

### Container and runtime

Search Dockerfiles, Compose files and manifests: `USER` in the final stage, `privileged:\s*true`, `runAsNonRoot`, `readOnlyRootFilesystem`, `allowPrivilegeEscalation`, `hostNetwork`, `hostPath`, `capabilities`, secrets passed as build args (`ARG .*(TOKEN|SECRET|PASSWORD|KEY)`), `.dockerignore` missing `.env` and `.git`, exposed debug ports (`9229`, `5005`, `5678`), DB and cache ports published to `0.0.0.0` in production Compose files.

Pass when the app runs as a non-root user without extra privileges, secrets are injected at runtime (not baked into layers), and only the app port is exposed. Secrets in image layers: **High**. Root user: **Medium**.

### Default credentials and admin accounts

Search seeds and migrations for admin users with fixed passwords (`admin@`, `password123`, `changeme`, `seed.*admin`), and config defaults like `SECRET_KEY\s*=\s*['\"]` with a literal or `JWT_SECRET\s*\|\|\s*['\"]` fallbacks. A hard-coded fallback secret used when the env var is missing: **High**.

## Static Analysis (SAST) Notes

Step 6 runs SAST tools that are already installed. Useful exclusions so results stay on project code:

- `semgrep scan --config <project config or p/default> --metrics=off --exclude node_modules --exclude vendor --exclude .venv --json --output "$TMP/semgrep.json"`. Registry rule packs are downloaded; no code is uploaded with metrics off and no login. Prefer the project's own `.semgrep.yml` when present.
- `bandit -r <source dir> -x ./.venv,./venv,./env,./node_modules,./build -f json` (bandit does not skip virtualenvs by default). Respect `[tool.bandit]` in `pyproject.toml`.
- `gosec -fmt json ./...`.
- Node: the project's ESLint with `eslint-plugin-security` only if it is already configured.
- Java: SpotBugs with FindSecBugs only if configured in the build.

Discard any hit whose path is outside the project's source roots. Triage every remaining hit by reading the code.

## Privacy

An engineering check, not a legal opinion. If the user names a regime (GDPR, CCPA, HIPAA, PCI DSS), note which checks relate to it and recommend review by their compliance contact.

### 1. PII inventory

Build the table from `db-schema.md`, models and migrations. Search column and field names: `email|phone|mobile|name|first_?name|last_?name|address|street|zip|postal|birth|dob|gender|ssn|national_?id|passport|tax_?id|iban|card|pan|ip_?address|location|lat|lng|device_?id|health|diagnos`.

```markdown
| Data | Table.column / store | Category | Source | Shared with | Retention | Protection |
|---|---|---|---|---|---|---|
| Email | users.email | contact | signup | email provider | account lifetime | unique index, not encrypted |
| Card last 4 | payments.card_last4 | financial (partial) | provider | - | 7 years | ok |
| IP address | audit_logs.ip | online identifier | request | - | unknown | - |
```

Also list PII outside the main DB: logs, analytics events, caches, search indexes, object storage, backups, queues, third-party processors (email, SMS, payment, analytics, AI APIs).

### 2. Checks

- **Minimization**: fields collected but not used; full values stored where a token or last-four would do. **Low/Medium**.
- **Sensitive data at rest**: government IDs, health data, bank details, full card data and secrets stored in plain columns. Full card numbers (PAN) stored at all: **Critical** (use the payment provider's tokens). Other highly sensitive fields unencrypted: **High**; owner `backend-db-design`.
- **Retention**: is there a job or policy that deletes or anonymizes old data (sessions, logs, soft-deleted rows, audit tables)? None for PII: **Medium**.
- **Erasure**: can a user's data be deleted or anonymized on request across all stores, including search indexes, caches and third parties? Note that backups age out on their own schedule; record that. Missing erasure path: **Medium**.
- **Export / access**: can a user's data be exported on request? Missing: **Low** unless a regime requires it.
- **Third-party sharing**: PII sent to external APIs (analytics, AI, error tracking) without need or masking; error trackers capturing request bodies. **Medium**.
- **PII in logs and URLs**: covered above; PII in query strings ends up in access logs: **Medium**.
- **Access to PII**: admin and support tools that read PII have authorization and an audit trail (ties to API5).

### 3. Output

Add the PII table and privacy findings to the report. Retention and erasure gaps go to `backend-db-design` (schema, jobs) and `backend-implement` (endpoints); log masking goes to `backend-implement`; backup retention goes to `backend-ops`.
