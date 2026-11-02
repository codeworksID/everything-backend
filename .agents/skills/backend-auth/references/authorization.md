# Authorization, Tenancy and Middleware

Read this when designing roles and permissions, multi-tenant isolation, tenant- or owner-scoped repository queries, or writing the authenticate/authorize middleware. For framework wiring, see the matching file in `<shared>/stacks/`.

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
- The ownership check is not only an `if` in the service: the query itself binds the tenant (and the owner for user-owned rows), as in the repository below.

```typescript
// Tenant-scoped ownership check in the service layer.
// principal comes from the verified token or session, never from body, query, or headers.
// repo.findById binds id AND tenant_id as parameters (see Tenant-Scoped Authorization).
const resource = await repo.findById(principal.tenantId, id);
if (!resource || resource.tenantId !== principal.tenantId) { // defense in depth
  throw new NotFoundError(); // do not reveal another tenant's resource
}
if (resource.ownerId !== principal.userId && !principal.roles.includes('admin')) {
  throw new ForbiddenError(); // principal.roles are scoped to principal.tenantId
}
```

## Tenant-Scoped Authorization

This is the auth side of `<shared>/sql-safety.md` -> The Rules, rule 3 ("A WHERE clause is not an access check"). That file owns the query rules (bound parameters, allowlisted identifiers, bounded writes, array binding); this section adds only where the owner value comes from.

- Take `tenant_id` and the user ID only from the authenticated principal (verified claim or server-side session). Ignore tenant IDs in the body, query, or headers such as `X-Tenant-ID` unless the server checks that the principal is a member of that tenant.
- Every read, update, and delete of a tenant- or user-owned row binds the owner predicate from the principal in the same statement: `WHERE id = $1 AND tenant_id = $2` (plus `AND owner_id = $3` for user-owned rows). `WHERE id = $1` alone, with a client-supplied id, is BOLA/IDOR (OWASP API1) even when the query is parameterized.
- Loading by id and checking ownership afterwards in code is not enough for writes: the UPDATE or DELETE itself carries the owner predicate, so a race or a missed `if` cannot change another tenant's row. Zero affected rows means 404.
- Filter every query on tenant-owned tables through a tenant-scoped repository. Postgres row-level security (RLS) is a second layer, not a replacement for the bound predicate.

```typescript
// Tenant-scoped repository (node-postgres). Values are always bound ($1, $2, ...);
// tenantId and ownerId come from the principal, never from the request.
export const orderRepo = {
  async findById(tenantId: string, id: string) {
    const r = await db.query(
      'SELECT id, tenant_id, owner_id, status FROM orders WHERE id = $1 AND tenant_id = $2',
      [id, tenantId],
    );
    return r.rows[0] ?? null; // another tenant's id -> null -> 404
  },

  // User-owned write: id, tenant and owner are all in the WHERE. 0 rows -> 404.
  async updateStatusOwned(tenantId: string, ownerId: string, id: string, status: OrderStatus) {
    const r = await db.query(
      'UPDATE orders SET status = $1 WHERE id = $2 AND tenant_id = $3 AND owner_id = $4',
      [status, id, tenantId, ownerId],
    );
    return r.rowCount === 1;
  },

  // Bulk delete: ids validated as UUIDs at the boundary, size-capped, bound as an array,
  // still tenant-scoped (add AND owner_id = $3 for user-owned rows).
  async deleteMany(tenantId: string, ids: string[]) {
    if (ids.length === 0 || ids.length > 100) throw new ValidationError('ids');
    const r = await db.query(
      'DELETE FROM orders WHERE id = ANY($1::uuid[]) AND tenant_id = $2',
      [ids, tenantId],
    );
    return r.rowCount;
  },
};
// An admin path that may act on any row in the tenant uses its own fixed query that binds
// id and tenant_id only, and is reached only after the authorization gate allows it.
```

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
