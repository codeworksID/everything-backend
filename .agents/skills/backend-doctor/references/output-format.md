# Health Check Output Format and Grading

Use this format for the final health check output. The examples show the format; replace them with real findings. Ratings follow the severity table in SKILL.md.

## Grading Rubric

Grade each category from its own findings, then the overall grade from all findings. A grade needs evidence: if the checks behind a category did not run, write "Not assessed" and say why.

| Grade | Rule |
|---|---|
| A | No findings above Low |
| B | Medium findings only |
| C | 1 or 2 High findings, no Critical |
| D | 3 or more High findings, no Critical |
| F | Any Critical finding, or the build fails |

Rules:

- A check that "did not complete" or was "not run" never counts as a pass. A category whose only check did not run is "Not assessed".
- Performance is graded from static checks only, and the Notes column says "static review, not measured" unless a benchmark ran.
- Testing uses test results plus measured coverage. Without a coverage tool, grade on results and write "coverage not measured".
- Overall uses the same rule over all findings, and lists the Not assessed categories next to the grade.

## Template

````markdown
# Backend Health Report

**Date**: [ISO timestamp]
**Project**: [Name]
**Scope**: [full | review of <base>...HEAD, N files]
**Overall Grade**: [A-F] (Not assessed: [categories or "none"])

## Summary
- **Critical**: [N]
- **High**: [N]
- **Medium**: [N]
- **Low**: [N]
- **Not run / did not complete**: [N]
- **Known issues**: [N resolved, N regressed, N still open] (from issues.md)

## Commands Executed
| Command | Exit Code | Result |
|---------|-----------|--------|
| `npm test` | 1 | 3 failures in `tests/auth.test.ts` (code) |
| `npm audit --omit=dev` | 1 | 1 high in `lodash@4.17.20` (fix: 4.17.21) |
| `npx --no-install tsc --noEmit` | 0 | clean |
| smoke test `GET /healthz` | - | not run: non-local target DATABASE_URL (host db.internal) |

## Critical Issues (Fix Immediately)

### 1. SQL injection in user lookup
- **File**: `src/repositories/user.ts:45`
- **Severity**: Critical
- **Category**: Security
- **Evidence**: content search for template literals in `query(` matched; reading the file confirmed `userId` from the request path is interpolated into the SQL text.
- **Impact**: An attacker can read or change any row and bypass authentication.
- **Recommendation**: Use a parameterized query.
- **Next skill**: backend-implement (then a backend-security review)
- **Example fix**:
  ```typescript
  // Before (vulnerable)
  const rows = await db.query(`SELECT * FROM users WHERE id = '${userId}'`);

  // After
  const rows = await db.query('SELECT * FROM users WHERE id = $1', [userId]);
  ```

### 2. Login accepts invalid credentials
- **File**: `tests/auth.test.ts:78`, `src/auth/login.ts:31`
- **Severity**: Critical (authentication bypass)
- **Category**: Security / Testing
- **Evidence**: `npm test` output: `expected 401, got 200` for a wrong password.
- **Recommendation**: Fix the password hash comparison; keep the failing test as is.
- **Next skill**: backend-auth

## High Issues (Fix Soon)

### 1. Vulnerable production dependency
- **File**: `package-lock.json`
- **Severity**: High
- **Category**: Dependencies
- **Evidence**: `npm audit --omit=dev`: `lodash <4.17.21  Severity: high  Prototype Pollution`.
- **Recommendation**: Upgrade to 4.17.21 (patch release, no breaking changes listed). Upgrading needs confirmation.
- **Next skill**: backend-implement

### 2. No validation on the registration body
- **File**: `src/controllers/user.ts:20`
- **Severity**: High (create endpoint)
- **Category**: Security / Quality
- **Evidence**: the handler reads `req.body` and imports no schema library.
- **Recommendation**: Add a Zod schema with an explicit field allowlist and return 422 on failure.
- **Next skill**: backend-implement

## Medium Issues (Plan to Fix)

### 1. No health route
- **File**: `src/app.ts`
- **Severity**: Medium
- **Category**: Observability
- **Evidence**: no route matching health, healthz, ready or live; `GET /` returned 200.
- **Recommendation**: Add liveness and readiness routes per the stack reference.
- **Next skill**: backend-ops

### 2. N+1 query in order listing
- **File**: `src/services/order.ts:58`
- **Severity**: Medium
- **Category**: Performance
- **Evidence**: content search found `findItems(order.id)` inside a loop over `findOrders()` results; reading the file confirmed one query per order.
- **Recommendation**: Load items in one query (join or `WHERE order_id IN (...)`) and paginate the list endpoint.
- **Next skill**: backend-refactor

## Low / Recommendations

### 1. Inconsistent handler naming
- **File**: `src/controllers/`
- **Severity**: Low
- **Category**: Quality
- **Evidence**: mixed `getUser` / `fetch_order` names in route handlers.
- **Next skill**: backend-refactor

## Not Run / Did Not Complete
| Check | Reason | How to run it |
|-------|--------|---------------|
| Smoke test | non-local target `DATABASE_URL` | point `.env.test` at a local database, or confirm the target |

## Known Issues (issues.md)
| Issue | Previous status | Now |
|-------|-----------------|-----|
| Missing input validation on user registration | Open | Still open |

## Scores by Category
| Category | Grade | Notes |
|----------|-------|-------|
| Code Quality | A | lint clean; 1 naming finding (Low) |
| Security | F | SQL injection and auth bypass (Critical) |
| Performance | B | static review, not measured: 1 N+1 (Medium) |
| Dependencies | C | 1 high in a production dependency |
| Testing | F | auth tests fail; coverage not measured |

## Architecture Findings
- **Layering**: [Good / Mixed / Poor / Not assessed] - [evidence file]
- **SOLID / SRP**: [Good / Mixed / Poor / Not assessed] - [evidence file]
- **Dependency Direction**: [Good / Mixed / Poor / Not assessed] - [evidence file]
- **Transaction Ownership**: [Good / Mixed / Poor / Not assessed] - [evidence file]
- **Normalization / Data Integrity**: [Good / Mixed / Poor / Not assessed] - [evidence file]

## Next Steps
1. [Owning skill]: [what to fix first]
2. backend-security: full security review (recommended when any Security finding is High or Critical)
````

Architecture labels: Good = no findings in that area; Mixed = Medium findings; Poor = any High or Critical finding.

## Recommendation Patterns

Use these when writing the Recommendation line and Next Steps. Doctor applies none of them; each goes to the finding's Next skill, and doctor applies one only if the user asks for that specific fix after seeing the output.

- **Security findings**: put Critical and High first; give a specific fix; recommend adding or strengthening a test that proves it (backend-test); recommend a backend-security review for anything beyond an obvious fix.
- **Performance findings**: put query problems first (N+1, missing indexes); then pagination on list endpoints; then caching or moving heavy work to a queue or background job, only where the hot path is known.
- **Code quality findings**: put maintainability risks first (god services, business rules duplicated across endpoints); recommend explicit boundaries (controller, service, repository) via backend-refactor; add missing tests and documentation.
- **Dependency findings**: name the fixed version and any breaking changes for each upgrade; recommend removing unused dependencies (for example from `dependency:analyze`, `depcheck` or `deptry` output if those tools are already available); recommend committing the lockfile and pinning versions where ranges are loose; recommend an automated dependency scan in CI (Next skill backend-deploy). Installing, upgrading or removing a dependency always needs confirmation (`<shared>/tool-rules.md` -> Always Ask First).

