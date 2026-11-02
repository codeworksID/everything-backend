# Security Negative Tests (Injection, Cross-Tenant Access and Beyond)

Read this when the feature takes user-controlled query parameters (search, filter, sort, id, free text, JSON filter bodies) or reads or writes tenant- or user-owned rows. These tests implement `<shared>/sql-safety.md` -> Verification, step 4. The rules themselves (bound values, allowlisted identifiers, owner predicate, escaped LIKE, NoSQL operator rejection) live in `<shared>/sql-safety.md`; this file only shows how to prove them with tests.

## What the Tests Must Prove

For every hostile input, the endpoint must do one of these:

- return 400 (or 422) with the project's error shape, or
- return 200 with an empty result or only the caller's own rows, or
- return 404 or 403 for another tenant's or user's id.

A test fails when any of these happen:

- a 500, or a response body that contains driver text (`syntax error`, `SQLSTATE`, `ORA-`, `ER_PARSE_ERROR`, `sqlite3`, a stack trace);
- more rows than the caller owns, or any row from another tenant or user;
- a row count that changed after a read, or a changed row in another tenant after a write;
- a table that no longer exists (the `DROP TABLE` payload ran).

## Ground Rules

- **Run against a real database.** Injection only shows up when a real SQL engine parses the query. A mocked repository proves nothing here. These are integration tests: the Target Check in SKILL.md applies, and the database must be local or disposable.
- **Use the real middleware stack**, including auth and validation, as in `references/api-and-auth-tests.md`.
- **Seed two tenants (or two users)** with factories in every file: the caller's tenant A and a victim tenant B, each with known rows. Count assertions only work when you know the exact seed.
- **Keep the payload list in one shared helper** so every endpoint gets the same set and new payloads reach all tests at once.
- **A failing test here is an implementation bug, not a test bug.** Do not loosen it. Hand it to `backend-debug` (or report it to `backend-security`) with the payload, the response, and the endpoint. Severity follows `<shared>/sql-safety.md` -> Verification, step 5: Critical when the endpoint is public or low-privilege.

## Payload Set

| Group | Payloads | Send them to |
|---|---|---|
| Classic SQL | `' OR '1'='1`, `1 OR 1=1`, `1; DROP TABLE users--`, `' UNION SELECT NULL--`, `\` | search, filter, free text, path and query ids |
| Encoding | Unicode quotes `ʼ` and `＇`, a NUL byte (`a\u0000b`), a 10 kB string | the same parameters |
| LIKE wildcards | `%`, `_`, `a_b`, `100%` | search and "contains" filters |
| Identifiers | `id; DROP TABLE users`, `name desc, (select 1)`, `nonexistent_column`, `name; --` | sort, order, field and column parameters |
| NoSQL operators | `{"$ne": null}`, `{"$gt": ""}`, `{"$where": "1"}`, `["a","b"]` where a scalar is expected, keys with `$` or `.` | JSON bodies, and query strings parsed into objects (`?email[$ne]=x`) |
| Ownership | tenant B's ids; `tenantId` or `ownerId` in the body or query | every by-id read, update and delete, list filters, bulk endpoints |

## Node: Vitest + Supertest

```typescript
// test/helpers/hostile.ts
export const SQLI_VALUES = [
  "' OR '1'='1", '1 OR 1=1', '1; DROP TABLE projects--', "' UNION SELECT NULL--", '\\',
  'ʼ OR ʼ1ʼ=ʼ1', '＇ OR ＇1＇=＇1', 'a\u0000b', 'x'.repeat(10_000),
];
export const BAD_SORTS = ['id; DROP TABLE projects', 'name desc, (select 1)', 'nonexistent_column', 'name; --'];
export const SQL_ERROR_TEXT = /syntax error|SQLSTATE|ER_PARSE_ERROR|sqlite3?|ORA-\d|unterminated|at .+\.(js|ts):\d+/i;
```

```typescript
// test/projects.security.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../src/app';
import { db } from './helpers/db';
import { authHeader } from './helpers/auth';
import { seedTenant } from './factories';
import { SQLI_VALUES, BAD_SORTS, SQL_ERROR_TEXT } from './helpers/hostile';

const countAll = async () => Number((await db.query('SELECT count(*) AS n FROM projects')).rows[0].n);

describe('GET /projects injection and tenant isolation', () => {
  let a: Awaited<ReturnType<typeof seedTenant>>;
  let b: Awaited<ReturnType<typeof seedTenant>>;

  beforeEach(async () => {
    a = await seedTenant({ projects: ['alpha', 'a_b', 'axb'] }); // caller
    b = await seedTenant({ projects: ['victim-1', 'victim-2'] }); // victim
  });

  it.each(SQLI_VALUES)('search q=%j returns 400 or only own rows', async (q) => {
    const before = await countAll();
    const res = await request(app).get('/projects').query({ q }).set(await authHeader(a.user));

    expect([200, 400, 422]).toContain(res.status);
    expect(JSON.stringify(res.body)).not.toMatch(SQL_ERROR_TEXT);
    if (res.status === 200) {
      expect(res.body.items.length).toBeLessThanOrEqual(a.projects.length);
      for (const p of res.body.items) expect(p.tenantId).toBe(a.tenant.id);
    }
    expect(await countAll()).toBe(before); // also proves the table still exists
  });

  it('LIKE wildcards match literally', async () => {
    const auth = await authHeader(a.user);
    const pct = await request(app).get('/projects').query({ q: '%' }).set(auth);
    expect(pct.status).toBe(200);
    expect(pct.body.items).toHaveLength(0); // no project name contains a literal %

    const under = await request(app).get('/projects').query({ q: 'a_b' }).set(auth);
    expect(under.body.items.map((p: { name: string }) => p.name)).toEqual(['a_b']); // not 'axb'
  });

  it.each(BAD_SORTS)('sort=%j is rejected by the allowlist', async (sort) => {
    const res = await request(app).get('/projects').query({ sort }).set(await authHeader(a.user));
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toMatch(SQL_ERROR_TEXT);
  });

  it('path id with SQL is 400 or 404, never 200', async () => {
    const res = await request(app).get(`/projects/${encodeURIComponent('1 OR 1=1')}`).set(await authHeader(a.user));
    expect([400, 404]).toContain(res.status);
  });

  it('query-string operator object is rejected (?name[$ne]=x)', async () => {
    const res = await request(app).get('/projects?name[$ne]=x').set(await authHeader(a.user));
    expect([400, 422]).toContain(res.status);
  });

  it('cross-tenant read, update and delete return 404/403 and change nothing', async () => {
    const auth = await authHeader(a.user);
    const victim = b.projects[0];

    expect([403, 404]).toContain((await request(app).get(`/projects/${victim.id}`).set(auth)).status);
    expect([403, 404]).toContain(
      (await request(app).patch(`/projects/${victim.id}`).send({ name: 'pwned' }).set(auth)).status,
    );
    expect([403, 404]).toContain((await request(app).delete(`/projects/${victim.id}`).set(auth)).status);

    const row = (await db.query('SELECT name FROM projects WHERE id = $1', [victim.id])).rows[0];
    expect(row?.name).toBe(victim.name); // still exists, unchanged
  });

  it('list ignores a client-supplied tenantId', async () => {
    const res = await request(app).get('/projects').query({ tenantId: b.tenant.id }).set(await authHeader(a.user));
    for (const p of res.body.items ?? []) expect(p.tenantId).toBe(a.tenant.id);
  });

  it('bulk delete with a mixed id list leaves the other tenant intact', async () => {
    const ids = [a.projects[0].id, b.projects[0].id];
    await request(app).post('/projects/bulk-delete').send({ ids }).set(await authHeader(a.user));
    const left = await db.query('SELECT count(*) AS n FROM projects WHERE tenant_id = $1', [b.tenant.id]);
    expect(Number(left.rows[0].n)).toBe(b.projects.length);
  });
});
```

NoSQL login bypass (MongoDB/Mongoose apps):

```typescript
it.each([
  { email: { $ne: null }, password: { $ne: null } },
  { email: 'a@example.test', password: { $gt: '' } },
  { email: ['a@example.test'], password: 'x' },
  { email: 'a@example.test', password: 'x', $where: '1' },
])('login rejects operator payload %j', async (body) => {
  const res = await request(app).post('/auth/login').send(body);
  expect([400, 401, 422]).toContain(res.status);
  expect(res.body.token).toBeUndefined();
});
```

## Python: pytest + httpx

```python
# tests/hostile.py
import re

SQLI_VALUES = [
    "' OR '1'='1", "1 OR 1=1", "1; DROP TABLE projects--", "' UNION SELECT NULL--", "\\",
    "ʼ OR ʼ1ʼ=ʼ1", "＇ OR ＇1＇=＇1", "a\x00b", "x" * 10_000,
]
BAD_SORTS = ["id; DROP TABLE projects", "name desc, (select 1)", "nonexistent_column", "name; --"]
SQL_ERROR_TEXT = re.compile(r"syntax error|SQLSTATE|psycopg|asyncpg|sqlalchemy|sqlite3|ORA-\d|Traceback", re.I)
```

```python
# tests/test_projects_security.py
import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text

from app.main import app
from tests.factories import seed_tenant
from tests.auth import auth_header
from tests.hostile import SQLI_VALUES, BAD_SORTS, SQL_ERROR_TEXT

pytestmark = pytest.mark.anyio


@pytest.fixture
async def client():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c


@pytest.fixture
async def tenants(db_session):
    a = await seed_tenant(db_session, projects=["alpha", "a_b", "axb"])  # caller
    b = await seed_tenant(db_session, projects=["victim-1", "victim-2"])  # victim
    return a, b


async def count_all(db_session) -> int:
    return (await db_session.execute(text("SELECT count(*) FROM projects"))).scalar_one()


@pytest.mark.parametrize("q", SQLI_VALUES)
async def test_search_payload_returns_400_or_own_rows(client, tenants, db_session, q):
    a, _ = tenants
    before = await count_all(db_session)
    res = await client.get("/projects", params={"q": q}, headers=auth_header(a.user))

    assert res.status_code in (200, 400, 422)
    assert not SQL_ERROR_TEXT.search(res.text)
    if res.status_code == 200:
        items = res.json()["items"]
        assert len(items) <= len(a.projects)
        assert all(p["tenant_id"] == str(a.tenant.id) for p in items)
    assert await count_all(db_session) == before


async def test_like_wildcards_match_literally(client, tenants):
    a, _ = tenants
    h = auth_header(a.user)
    assert (await client.get("/projects", params={"q": "%"}, headers=h)).json()["items"] == []
    names = [p["name"] for p in (await client.get("/projects", params={"q": "a_b"}, headers=h)).json()["items"]]
    assert names == ["a_b"]


@pytest.mark.parametrize("sort", BAD_SORTS)
async def test_sort_is_allowlisted(client, tenants, sort):
    a, _ = tenants
    res = await client.get("/projects", params={"sort": sort}, headers=auth_header(a.user))
    assert res.status_code in (400, 422)
    assert not SQL_ERROR_TEXT.search(res.text)


@pytest.mark.parametrize("body", [
    {"email": {"$ne": None}, "password": {"$ne": None}},
    {"email": "a@example.test", "password": {"$gt": ""}},
    {"email": ["a@example.test"], "password": "x"},
])
async def test_login_rejects_operator_objects(client, body):
    res = await client.post("/auth/login", json=body)
    assert res.status_code in (400, 401, 422)
    assert "token" not in res.text


async def test_cross_tenant_access_is_denied_and_changes_nothing(client, tenants, db_session):
    a, b = tenants
    h = auth_header(a.user)
    victim = b.projects[0]

    assert (await client.get(f"/projects/{victim.id}", headers=h)).status_code in (403, 404)
    assert (await client.patch(f"/projects/{victim.id}", json={"name": "pwned"}, headers=h)).status_code in (403, 404)
    assert (await client.delete(f"/projects/{victim.id}", headers=h)).status_code in (403, 404)

    row = (await db_session.execute(text("SELECT name FROM projects WHERE id = :id"), {"id": victim.id})).one_or_none()
    assert row is not None and row.name == victim.name
```

Adapt names, routes, and the error-text pattern to the project. Keep the asserts: status in the allowed set, no driver text, no foreign rows, unchanged counts.

## Beyond SQL (secure-coding.md)

These tests implement `<shared>/secure-coding.md` -> Verification, step 4. Add the rows that match what the endpoint does; an endpoint that accepts a URL, a file, a redirect target or a webhook and has no test for it is a gap.

| Rule | Send | Pass when |
|---|---|---|
| S2 mass assignment | body with `role: "admin"`, `isAdmin: true`, `tenantId: <B>`, `ownerId: <B>`, `emailVerified: true`, `balance: 1e9` | 200/201 with those fields unchanged in the database, or 400; the response never contains `passwordHash`, tokens or internal flags |
| S3 function access | a normal user's token on admin, export, impersonation and bulk routes; no token on every non-public route | 403 (or 404) and 401 |
| S15 limits | a body over the route's limit, an array of 100,000 items, JSON nested 1,000 levels, `?limit=1000000` | 413 or 400, or the page size capped at the maximum; never a 500 or a timeout |
| S5 paths and uploads | `../../etc/passwd`, `..%2f..%2fetc%2fpasswd`, `/etc/passwd`, `C:\Windows\win.ini`, `a%00.png`; a `.png` that is really HTML or SVG with a script; an oversized file; a zip with a `../` entry | 400 or 404; no file read or written outside the base folder; the upload rejected or served as an attachment |
| S6 SSRF | `http://169.254.169.254/latest/meta-data/`, `http://127.0.0.1:22`, `http://[::1]/`, `http://[::ffff:127.0.0.1]/`, `http://2130706433/`, `http://0.0.0.0/`, `file:///etc/passwd`, `gopher://x`, and a public URL that redirects to `127.0.0.1` | 400 before any connection is made (assert the HTTP client stub was never called with that address) |
| S4, S8 command and template | `; id`, `$(id)`, `` `id` ``, `\| whoami`, `--help`, `-oProxyCommand=x`, `{{7*7}}`, `${7*7}`, `<%= 7*7 %>`, `#{7*7}` | 400, or the value stored and echoed literally; never `49` and never command output |
| S9 output and redirects | `<script>alert(1)</script>`, `"><img src=x onerror=alert(1)>` in rendered fields; `next=//evil.example`, `next=https://evil.example`, `next=/\evil.example`; a value with `\r\nSet-Cookie: x=1` that ends up in a header; `=HYPERLINK("http://x")` in a CSV export | the markup escaped in the output; the redirect refused or sent to a default path; no injected header; the CSV cell prefixed with `'` |
| S10 regex and prototype | `(a+)+$` with `"a".repeat(30) + "!"` where a pattern is accepted; `{"__proto__": {"isAdmin": true}}` and `{"constructor": {"prototype": {"isAdmin": true}}}` | a fast 400; after the request `({}).isAdmin` is still undefined |
| S11 tokens | `alg: none`; an HS256 token signed with the RS256 public key; expired; wrong `aud`/`iss`; a `kid`/`jku` pointing elsewhere; a reused password-reset token | 401 (or 400 for the reset); the reset works only once |
| S11, S15 brute force | 20 failed logins for one account, and from one IP | 429 or a lockout response; the response does not reveal whether the account exists |
| S16 webhooks | no signature; a wrong signature; a valid signature over a re-serialized body; a timestamp 10 minutes old; the same event id twice | 401 for the first four; the duplicate processed once |
| S17 errors | any input that makes the handler throw | a generic error body with a correlation id; no stack trace, SQL, file path or framework banner |

```typescript
// test/users.security-beyond-sql.test.ts (Vitest + Supertest; adapt routes and factories)
it('ignores privileged fields in the body (S2)', async () => {
  const res = await request(app).patch('/v1/me').set(authHeader(userA))
    .send({ name: 'x', role: 'admin', tenantId: tenantB.id });
  expect([200, 400]).toContain(res.status);
  const row = await db.user.findUniqueOrThrow({ where: { id: userA.id } });
  expect(row.role).toBe(userA.role);
  expect(row.tenantId).toBe(userA.tenantId);
  expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|password_hash/);
});

it.each(['http://169.254.169.254/latest/meta-data/', 'http://127.0.0.1:22', 'http://[::ffff:127.0.0.1]/', 'file:///etc/passwd'])(
  'rejects internal webhook target %s (S6)', async (url) => {
    const res = await request(app).post('/v1/webhooks').set(authHeader(userA)).send({ url });
    expect(res.status).toBe(400);
    expect(httpClientStub).not.toHaveBeenCalled();
  });

it('rejects a prototype-pollution body (S10)', async () => {
  await request(app).post('/v1/settings').set(authHeader(userA))
    .set('content-type', 'application/json').send('{"__proto__":{"isAdmin":true}}');
  expect(({} as Record<string, unknown>).isAdmin).toBeUndefined();
});
```

```python
# tests/test_security_beyond_sql.py (pytest + httpx; adapt routes and fixtures)
@pytest.mark.parametrize("name", ["../../etc/passwd", "..%2f..%2fetc%2fpasswd", "/etc/passwd", "a\x00.png"])
async def test_download_rejects_traversal(client, user_a_headers, name):  # S5
    res = await client.get(f"/v1/files/{name}", headers=user_a_headers)
    assert res.status_code in (400, 404)
    assert "root:" not in res.text

async def test_webhook_rejects_stale_signature(client, sign):  # S16
    body = b'{"id":"evt_1","type":"paid"}'
    res = await client.post("/v1/webhooks/stripe", content=body,
                            headers=sign(body, timestamp=time.time() - 600))
    assert res.status_code == 401
```

## Other Stacks

The same cases apply everywhere; only the client changes: Go `httptest` with table-driven tests, Spring MockMvc or `WebTestClient` with `@ParameterizedTest` + `@MethodSource`, .NET `WebApplicationFactory` with `[Theory]` + `[MemberData]`. Keep the payload list in one shared source per project.

## Fuzzing (optional, proposed not added)

Spec-driven fuzzing (Schemathesis for OpenAPI) and an authenticated DAST scan (e.g. OWASP ZAP against a local instance) can find parameters these tests missed. Both run against a running app, so they go through the Target Check and need local targets only. Installing them is Always Ask First. They add to the tests above; they do not replace them.

## Reporting

In the Test Work Summary, list each endpoint covered and, for each payload group, pass, fail (with the payload and response status), or not applicable (with why, e.g. "no sort parameter"). An endpoint that takes user-controlled query parameters or touches tenant data and has no tests from this file is a gap, reported as such.
