# Security Review Report Template

Read this in Step 9. Write the report to `docs/security/review-<YYYYMMDD>.md` (add `-2`, `-3` if a report already exists for the date). Fill every section; write "Not assessed: <reason>" rather than leaving one out. Never include secret values.

## Severity Rubric

Rate exploitability and impact from evidence, then pick the level. Use the same levels as `issues.md`.

| Severity | Meaning | Typical examples |
|---|---|---|
| Critical | Exploitable now by an external or low-privilege attacker, with severe impact (full account or tenant takeover, mass data exposure, remote code execution, live production secret exposed). | Live cloud key in the working tree; auth bypass; SQL or NoSQL injection, or a missing owner predicate (BOLA/IDOR), on a public or low-privilege route (`_shared/sql-safety.md` -> Verification 5); debugger console in production. |
| High | Exploitable with modest effort or preconditions, or severe impact with harder exploitation. | IDOR or injection reachable only by privileged or internal callers; missing role check on an admin route; SSRF without an internal-range guard; credentials in git history; secrets in logs. |
| Medium | Real weakness with limited impact or needing unlikely conditions; defense-in-depth gaps on sensitive paths. | Missing rate limit on login; stack traces returned to clients; unpinned third-party CI actions; no retention for PII. |
| Low | Hardening and hygiene; little direct impact. | `X-Powered-By` header; missing dependency update bot; base image tag without digest. |
| Info | Observation or accepted risk, no action required. | Public API docs by design. |

Adjust one level down only with evidence (for example the route is not reachable from the internet and a network control enforces that). Always say why a level was adjusted.

## Finding Format

```markdown
### SEC-001: <short title>

- **Severity:** Critical (any logged-in user can exploit it)
- **OWASP:** API1:2023 Broken Object Level Authorization (CWE-639)
- **Location:** `src/orders/orders.controller.ts:42`, `src/orders/orders.service.ts:88`
- **Evidence:** `findUnique({ where: { id } })` loads the order by ID only; the handler never compares `order.userId` with `req.user.id`. Confirmed by reading the route and its guards (`JwtAuthGuard` only authenticates).
- **Impact:** Any logged-in user can read and update any other user's orders by changing the ID.
- **Fix:** Scope the query by owner: `where: { id, userId: req.user.id }`, return 404 when not found. Add negative tests (user A reads, updates, deletes user B's order -> 404).
- **Owner:** backend-debug (fix + regression test); backend-auth to review the shared policy.
- **Status:** Open
```

Rules:
- Evidence is `file:line` plus what you read or ran. For secrets: `file:line` and type only. For dependencies: package, version and advisory ID. For config: file and key.
- One finding per root cause. List all affected locations under it instead of one finding per route.
- If you could not confirm exploitability, write "Unconfirmed" in Evidence and keep the severity it would have if true, with that caveat.

## Report Layout

````markdown
# Security Review: <service or feature> (<YYYY-MM-DD>)

## Summary
- Scope: <service | diff base...head | feature>, commit <short sha or "uncommitted working tree">
- Reviewer: backend-security skill (automated white-box review; not a penetration test)
- Result: <N> Critical, <N> High, <N> Medium, <N> Low, <N> Info
- Top risks: <one line each for the 3 most important findings>

## Scope and Method
- Entry points reviewed: <count, list or link to table>
- Coverage notes: <sampling, excluded dirs, generated code>
- Tools run: <tool and version, command> ...
- Not run: <tool or check, reason, exact command for the user>

## Threat Model
<System summary, assets, actors, entry points and boundaries, STRIDE table, threats needing review: from threat-model.md, trimmed to what matters>

## OWASP API Security Top 10 (2023)
| ID | Item | Verdict | Findings / reason |
|---|---|---|---|
| API1 | Broken Object Level Authorization | finding | SEC-001 |
| API2 | Broken Authentication | pass | JWT verified with pinned RS256, iss, aud, exp (src/auth/jwt.ts:20); login throttled |
| API3 | Broken Object Property Level Authorization | finding | SEC-003 |
| API4 | Unrestricted Resource Consumption | finding | SEC-004 |
| API5 | Broken Function Level Authorization | pass | all /admin routes behind RolesGuard('admin') |
| API6 | Unrestricted Access to Sensitive Business Flows | pass | signup and coupon redeem rate limited per account and IP |
| API7 | Server-Side Request Forgery | not applicable | no outbound HTTP with user-supplied URLs |
| API8 | Security Misconfiguration | finding | SEC-005, SEC-006 |
| API9 | Improper Inventory Management | pass | code routes match openapi.yaml |
| API10 | Unsafe Consumption of APIs | finding | SEC-007 |

### Injection (`_shared/sql-safety.md`)
| Check | Verdict | Evidence / findings |
|---|---|---|
| Rules 1-2, 4-9: values bound, identifiers allowlisted, bounded writes, array binding, LIKE, raw APIs, DB-side dynamic SQL, NoSQL operators | pass | all queries via Prisma finders and tagged `$queryRaw`; sort mapped in src/orders/sort.ts:5 |
| Rule 3: owner predicate (same as API1) | finding | SEC-001 |
| Second-order (stored values reaching query text) | pass | no stored identifiers or SQL fragments |
| Rules 10-12: validation, least-privilege DB role, error leakage | Not assessed: role grants not in repo | user to run `\du` / `\dp` |
| Verification: static search, DAO files read, SAST (semgrep p/sql-injection, bandit B608, gosec G201/G202), negative tests | partial | semgrep run; negative tests missing for /search (SEC-008) |

Other checks (command/template injection, deserialization, path traversal, uploads, crypto, webhooks, redirects): <verdicts>

## Findings
<SEC-001 ... in severity order, using the finding format>

## Secrets
| Location | Type | Where | Action |
|---|---|---|---|
| `config/prod.js:12` | AWS access key | working tree | rotate, move to secret manager |
| `a1b2c3d4 .env` | DB URL with password | history only | rotate |

## Dependencies and Supply Chain
| Package | Version | Fixed in | Severity | Advisory | Direct | Prod |
|---|---|---|---|---|---|---|

- SBOM: <path or "not generated: syft not installed">
- Image scan: <summary or "not run">
- Pinning and CI: <findings or pass>
- Licenses: <flags or "no copyleft/unknown licenses found">

## SAST
<tool, rules, counts: total hits, true positives (finding IDs), false positives (one line each)>

## Configuration
<CORS, headers, TLS, cookies, debug/docs, error leakage, logging, container: pass or finding ID per area>

## Privacy
<PII inventory table; retention, erasure, export, third-party sharing results>

## Recommendations and Owners
| Finding | Owner skill | Suggested order |
|---|---|---|

## Limitations
- White-box review of the code and config in the repository; no live testing of shared environments.
- <anything not reviewed: infrastructure accounts, client apps, third-party configs>
````

## issues.md Entry

Append one entry per open Critical, High or Medium finding, in the `memory-schema.md` issues format. Search for an existing open entry with the same location and type first; update it instead of adding a duplicate.

```markdown
## [YYYY-MM-DD HH:MM] SEC-001 IDOR on order read/update

### Severity
Critical

### Description
Orders are loaded by ID without an ownership check (OWASP API1:2023). Any authenticated user can read and update other users' orders.

### Location
src/orders/orders.controller.ts:42, src/orders/orders.service.ts:88

### Status
Open

### Recommendation
Scope queries by owner and add negative tests. Full details: docs/security/review-YYYYMMDD.md (SEC-001)

### Owner
backend-debug
```

Update `## Last Updated` in `issues.md`. Low and Info findings stay in the report only.

## Chat Summary

```markdown
## Security Review Summary
- Report: docs/security/review-YYYYMMDD.md
- Scope: ...
- Findings: N Critical, N High, N Medium, N Low
- OWASP API Top 10: <compact verdict list, e.g. API1 finding, API2 pass, ...>
- Injection (sql-safety.md): <pass | finding IDs | partial: what was not verified>
- Top findings: SEC-001 (Critical) IDOR on orders, src/orders/orders.service.ts:88; ...
- Secrets: <count and "rotate first" note, or none found>
- Not run: <tools and checks, with commands>
- Next: <owner skills in suggested order>
```
