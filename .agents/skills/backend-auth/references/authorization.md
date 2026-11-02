# Authorization, Tenancy and Middleware

Read this when designing roles and permissions, multi-tenant isolation, or writing the authenticate/authorize middleware. For framework wiring, see the matching file in `<shared>/stacks/`.

## Where Checks Run (one rule)

- **Middleware** authenticates (attaches the verified principal) and may enforce coarse gates: `requireAuth`, and a route-level `requireRole` / `requirePermission` for whole endpoints (e.g. admin routes).
- **Services** enforce everything that depends on the resource: tenant match, ownership, sharing grants, and fine-grained permissions. Route parameters alone are never trusted.
- Controllers ask one question through a single authorization gate: "can this principal do this action on this resource?"
- Pass the verified principal to services through request context; never re-read user or tenant IDs from the client.
- Document each endpoint's auth requirement (security scheme, required permission) in the API spec; `backend-api-design` records it per endpoint.

## Models

### RBAC
- Coarse roles: `admin`, `editor`, `viewer`, `service`.
- Map roles to permissions in one place (a permission matrix), not scattered `if role ==` checks.
- Roles are tenant-scoped when the system is multi-tenant.

Permission matrix template:

| Permission | admin | editor | viewer | service |
|---|---|---|---|---|
| orders:read | yes | yes | yes | yes |
| orders:write | yes | yes | no | yes |
| users:manage | yes | no | no | no |

### ABAC / policy-based
- Attributes: resource owner, department, subscription tier, time, environment.
- Use for compliance-heavy or complex multi-tenant rules. Write each policy down explicitly.
- Consider a policy engine (e.g. OPA, Cedar) or a relationship-based model (ReBAC, Zanzibar-style) when sharing and nested groups grow beyond simple ownership.

### Resource ownership
- Verify the actor owns the resource or holds an explicit grant.
- In multi-tenant systems, check the tenant first, then owner or role.
- Return 404 (not 403) when the resource belongs to another tenant, so existence is not revealed.

```typescript
// Tenant-scoped ownership check in the service layer.
// principal comes from the verified token or session, never from body, query, or headers.
const resource = await repo.findById(principal.tenantId, id); // query filters by tenant_id
if (!resource || resource.tenantId !== principal.tenantId) {
  throw new NotFoundError(); // do not reveal another tenant's resource
}
if (resource.ownerId !== principal.userId && !principal.roles.includes('admin')) {
  throw new ForbiddenError(); // principal.roles are scoped to principal.tenantId
}
```

## Tenant Isolation

- Take `tenant_id` only from the authenticated principal (verified claim or server-side session). Ignore tenant IDs in the body, query, or headers such as `X-Tenant-ID` unless the server checks that the principal is a member of that tenant.
- Filter every query on tenant-owned tables by `tenant_id` through a tenant-scoped repository, or enforce it with Postgres row-level security (RLS).
- With RLS:
  - Set the tenant at the start of each transaction with the parameterized `SELECT set_config('app.tenant_id', $1, true)` (`true` = transaction-local, like `SET LOCAL`). `SET` cannot take bind parameters, so never build it by string interpolation.
  - Write policies as `tenant_id = current_setting('app.tenant_id', true)::uuid`, so a missing setting yields NULL and matches no rows.
  - Never use session-level `SET` on pooled connections.
  - Superusers and `BYPASSRLS` roles skip RLS, and table owners do unless `FORCE ROW LEVEL SECURITY` is set. The app must not connect as any of them.
- Roles are tenant-scoped: an admin in tenant A has no rights in tenant B. Keep any platform-wide operator role separate, MFA-protected, and audited.
- RLS policies and `tenant_id` columns are schema changes: hand them to `backend-migrate`. See `<shared>/stacks/postgres.md` if present.

## Mass Assignment

- Bind request bodies to explicit DTOs with an allowlist of fields. Never let a client set `role`, `tenant_id`, `owner_id`, `is_admin`, `email_verified`, or similar through a generic update.
- Role and membership changes go through dedicated, permission-checked endpoints and are audit-logged.

## Middleware Shape (Express example)

```typescript
// authenticate: attach the verified principal, or continue as anonymous.
// Express 5 forwards rejected promises to the error middleware; Express 4 does not,
// so keep try/catch + next(err) there (or wrap the handler).
async function authenticate(req, res, next) {
  try {
    const token = extractBearerOrCookie(req);
    if (!token) return next(); // anonymous; requireAuth rejects it later
    const claims = await verifyAccessToken(token); // alg allowlist, iss, aud, exp/nbf
    req.context = {
      principal: { userId: claims.sub, tenantId: claims.tenant_id, roles: claims.roles ?? [] },
    };
    next();
  } catch (err) {
    // invalid or expired token -> 401; infrastructure errors (e.g. JWKS fetch) -> 5xx
    next(isTokenVerificationError(err) ? new UnauthorizedError() : err);
  }
}

function requireAuth(req, res, next) {
  if (!req.context?.principal) return next(new UnauthorizedError());
  next();
}

function requirePermission(permission) {
  return (req, res, next) => {
    const p = req.context?.principal;
    if (!p) return next(new UnauthorizedError());
    if (!can(p.roles, permission)) return next(new ForbiddenError()); // matrix lookup
    next();
  };
}
```

## Audit Logging

- Log: login success and failure, logout, password change, MFA enable/disable, token refresh, refresh-token reuse, role and membership changes, admin impersonation.
- Include: timestamp, user ID, tenant ID, IP, user agent, outcome, request ID.
- Exclude: passwords, tokens, secrets, full session IDs.
