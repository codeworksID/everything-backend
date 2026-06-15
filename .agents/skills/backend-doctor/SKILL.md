---
name: backend-doctor
description: "Run execution-based health checks on backend code: tests, lint/type checks, dependency audits, smoke tests, LSP diagnostics, and static anti-pattern scans. Identifies issues with severity levels and provides evidence-backed recommendations. Use this skill when the user says 'check my backend', 'health check', 'review code', 'doctor', or before deployment."
---

# Backend Doctor

## When to Activate

- User wants to check backend health.
- User says "check my backend", "health check", "review code", "doctor".
- Before deployment or after major changes.
- User asks "is my code secure?" or "are there performance issues?".

## Context Loading

Before running checks, read project memory for existing context:

- `project-overview.md` — project type and structure
- `tech-stack.md` — languages, frameworks, test commands
- `api-patterns.md` — API conventions and endpoint hot paths
- `db-schema.md` — database schema for data-integrity checks
- `decisions.md` — prior architecture and operational decisions
- `issues.md` — known issues and TODOs to validate or expand

If memory is stale or empty, run `backend-scan` first to build context.

## Before Running Checks

1. Confirm the project root and working directory.
2. If the project is unfamiliar, run `backend-scan` first to build context.
3. Read the manifest files (`package.json`, `pyproject.toml`, `go.mod`, `pom.xml`, `Makefile`) to detect which commands the project actually exposes.

## Detecting the Right Commands

Use `read` on the relevant manifest, then map standard scripts/goals to concrete commands.

| Stack | Manifest | Common commands to look for |
|-------|----------|----------------------------|
| Node.js | `package.json` scripts | `npm test`, `npm run lint`, `npm run typecheck`, `npm run build`, `npm audit` |
| Python | `pyproject.toml`, `setup.cfg`, `tox.ini`, `Makefile` | `pytest`, `ruff check .`, `mypy .`, `pip-audit --desc`, `bandit -r .` |
| Go | `go.mod` | `go test ./...`, `go vet ./...`, `golangci-lint run ./...`, `govulncheck ./...` |
| Java/Maven | `pom.xml` | `./mvnw test`, `./mvnw verify`, `./mvnw spotbugs:check`, `./mvnw dependency:analyze` |
| Generic | `Makefile` | `make test`, `make lint`, `make audit`, `make build` |

Prefer the exact script names found in the manifest. If a manifest is missing, fall back to the standard commands for the detected language. Never invent non-standard scripts.

## Running Checks

All checks must produce observable evidence (exit codes, command output, file paths, line numbers). Static observations are secondary and only support dynamic findings.

### 1. Run the Test Suite

Use `bash` to execute the detected test command.

Examples:
- Node.js: `npm test` or `npm run test:ci`
- Python: `pytest`
- Go: `go test ./...`
- Java/Maven: `./mvnw test`

Capture:
- Exit code.
- Number of failures/errors.
- Names of failing test files and the failing assertions.

If the test suite fails on a critical path (auth, payments, persistence, invariants), mark it **High** or **Critical**. A completely broken build is **Critical**.

### 2. Run Lint / Format / Type Checks

Use `bash` to run the relevant quality gates.

Examples:
- Node.js: `npm run lint`, `npm run typecheck`, `tsc --noEmit`
- Python: `ruff check .`, `black --check .`, `mypy .`
- Go: `go vet ./...`, `golangci-lint run ./...`
- Java/Maven: `./mvnw checkstyle:check`, `./mvnw spotbugs:check`

Then run `lsp_diagnostics` on the source directory or key files to catch compile/type errors the CLI tools may have missed.

Capture:
- Tool output and exit codes.
- `lsp_diagnostics` errors/warnings with file paths.

Severity:
- Type errors that could cause runtime failures: **High**.
- Linter/format failures on critical paths: **Medium**.
- Minor style-only linter warnings: **Low**.

### 3. Run Dependency Audits

Use `bash` to run the standard audit tool for the stack.

Examples:
- Node.js: `npm audit --audit-level moderate` or `pnpm audit`
- Python: `pip-audit --desc` or `safety check`
- Go: `govulncheck ./...`
- Java/Maven: `./mvnw dependency:check` or OWASP Dependency-Check

Capture:
- Vulnerability count and severity.
- Package names and affected versions.
- Whether a fix version is available.

Severity:
- Known exploitable vulnerability on a production dependency: **Critical**.
- High/CVSS-high vulnerability: **High**.
- Moderate or low vulnerabilities: **Medium** / **Low**.

### 4. Smoke Test the Running Application

If the project exposes a start command and a health/readiness endpoint, start the app with `bash`, wait for it to listen, then probe the endpoint.

Example flow:
1. Start server in the background: `npm start`, `python -m <module>`, `go run ./cmd/server`, etc.
2. Capture the process ID.
3. Probe the endpoint: `curl -fsS http://localhost:<port>/health` or `curl -fsS http://localhost:<port>/ready`.
4. Stop the server (kill the recorded PID).

If there is no health endpoint, skip this step and note it under **Recommendations**.

Severity:
- App fails to start or health check returns non-2xx: **High** or **Critical** depending on environment.
- Missing health endpoint on a service: **Medium**.

### 5. Scan for Static Anti-Patterns

Use `glob`, `read`, and `grep` to gather targeted evidence after dynamic checks.

Patterns to hunt:
- **Raw SQL / injection risk**: `grep` for string templates/interpolation inside SQL-like strings (`SELECT`, `INSERT`, `UPDATE`, `DELETE` combined with `${`, `%s`, `+`). Use `read` to confirm.
- **Secrets in code**: `grep` for `api[_-]?key`, `password`, `secret`, `token` followed by assignments or literals. Verify `.env` is in `.gitignore`.
- **Fat controllers / handlers**: `lsp_symbols` on controller files; flag files with many route methods or business branching.
- **Missing validation**: `grep` route handlers that do not reference validation schemas (Zod, Joi, Pydantic, etc.).
- **N+1 / broad queries**: `grep` for loops containing DB calls or `SELECT *` on hot paths.
- **Generic error responses**: `grep` for `status(500)`, `raise Exception`, or untyped error returns in API handlers.
- **Missing ownership checks**: `grep` protected route patterns and verify ownership/RBAC logic with `read`.

Severity:
- Confirmed injection or secret in committed code: **Critical**.
- Missing auth/ownership checks on protected routes: **High**.
- Missing validation on critical endpoints: **High**.
- N+1 or broad queries: **Medium**.
- Minor duplication or style issues: **Low**.

## Static Review (Secondary)

Use the following checklist only to classify findings gathered above. Do not present it as a primary deliverable.

See `_shared/principles.md` for the canonical backend principles that underpin this checklist.

## Evidence-Based Report

Every reported finding must be backed by evidence:

1. **File path and line number**: `src/routes/user.ts:42`.
2. **Tool or command that produced the evidence**: `npm test`, `npm audit`, `lsp_diagnostics`, `grep -n "SELECT \*" src/orders.ts`.
3. **Relevant output excerpt**: 2–10 lines of output showing the failure, vulnerability, or matched code.
4. **Severity and category** from the rules below.
5. **Why it violates a backend principle**.
6. **Recommendation or minimal fix** with a code example when useful.

If a required tool is missing or fails to run, report the exact error as a **Medium** finding under "Tooling".

## Severity Rules

- **Critical**: data loss risk, authentication bypass, injection (SQL, command, etc.), broken transaction/invariant handling, secrets exposure in code, known exploitable dependency vulnerability.
- **High**: strong maintainability or integrity risk, e.g. god service, missing ownership/authorization checks, duplicated business rules across endpoints, widespread type errors, failing critical-path tests.
- **Medium**: weak layering, missing tests on critical paths, weak index strategy, inconsistent error mapping, missing health endpoint, linter/type warnings that could hide real bugs.
- **Low**: naming, documentation, minor duplication, non-critical observability gaps, cosmetic linter warnings.

## Decision Trees

### If security issues found:
- Prioritize Critical and High severity.
- Provide specific fix instructions.
- Recommend immediate patches.
- Add or strengthen security tests.

### If performance issues found:
- Prioritize database query issues (N+1, missing indexes).
- Add pagination where missing.
- Consider caching strategy.
- Consider async processing for heavy workloads.

### If code quality issues found:
- Prioritize maintainability risks (god services, duplicated business rules).
- Recommend explicit boundary fixes (controller → service → repository).
- Add missing tests and documentation.

### If dependency issues found:
- Update vulnerable packages.
- Remove unused dependencies.
- Pin versions for stability.
- Check for breaking changes.
- Add automated dependency scanning.

## Health Report Template

```markdown
# Backend Health Report

**Date**: [ISO timestamp]
**Project**: [Name]
**Overall Score**: [A/B/C/D/F]

## Summary
- **Critical Issues**: [N]
- **High Issues**: [N]
- **Medium Issues**: [N]
- **Low Issues / Recommendations**: [N]

## Commands Executed
| Command | Exit Code | Notes |
|---------|-----------|-------|
| `npm test` | 1 | 3 failures in `auth.test.ts` |
| `npm audit` | 0 | 1 moderate vulnerability in `lodash@4.17.20` |
| `lsp_diagnostics` on `src/` | - | 12 errors, 4 warnings |

## Critical Issues (Fix Immediately)

### 1. SQL Injection Vulnerability
- **File**: `src/repositories/user.ts:45`
- **Severity**: Critical
- **Category**: Security
- **Evidence**: `grep -n "SELECT.*\${" src/repositories/user.ts` returned string-interpolated SQL.
- **Description**: Raw SQL query with string concatenation
- **Impact**: Attacker can read/modify any data, bypass authentication
- **Recommendation**: Use parameterized queries
- **Example Fix**:
  ```typescript
  // Before (VULNERABLE)
  const query = `SELECT * FROM users WHERE id = '${userId}'`;

  // After (SECURE)
  const query = 'SELECT * FROM users WHERE id = $1';
  const result = await db.query(query, [userId]);
  ```

## High Issues (Fix Soon)

### 1. Failing Authentication Tests
- **File**: `tests/auth.test.ts:78`
- **Severity**: High
- **Category**: Quality / Security
- **Evidence**: `npm test` output: `expected 401, got 200`.
- **Description**: Login endpoint returns 200 for invalid credentials.
- **Impact**: Auth bypass risk.
- **Recommendation**: Verify password hash comparison and reject invalid credentials.

## Medium Issues (Plan to Fix)

### 1. Missing Health Endpoint
- **File**: `src/app.ts`
- **Severity**: Medium
- **Category**: Observability
- **Evidence**: Smoke test `curl http://localhost:3000/health` returned `404 Not Found`.
- **Recommendation**: Add `/health` and `/ready` endpoints.

## Low / Recommendations (Consider)

### 1. Add Input Validation Schema
- **File**: `src/controllers/user.ts:20`
- **Severity**: Low
- **Category**: Quality
- **Evidence**: Route handler does not import any validation library.
- **Recommendation**: Add Zod/Pydantic validation for request bodies.

## Scores by Category
| Category | Score | Notes |
|----------|-------|-------|
| Code Quality | B | Good structure, some long functions |
| Security | C | SQL injection found, weak auth |
| Performance | B | Missing indexes, no caching |
| Dependencies | A | All up to date |
| Testing | C | Low test coverage |

## Architecture Findings
- **Layering**: [Good / Mixed / Poor]
- **SOLID / SRP**: [Good / Mixed / Poor]
- **Dependency Direction**: [Good / Mixed / Poor]
- **Transaction Ownership**: [Good / Mixed / Poor]
- **Normalization / Data Integrity**: [Good / Mixed / Poor]
```

## Edge Cases

- **No code to check**: Run `backend-scan` first.
- **Large codebase**: Run global tests/audits, then sample critical paths.
- **Legacy code**: Be lenient with warnings, focus on critical security issues.
- **Multiple languages**: Check each separately against language-specific best practices.
- **No memory files**: Suggest running `backend-scan` to get context.
- **No health endpoint**: Skip smoke test and note under recommendations.
- **Missing tooling**: Report the missing tool as a Medium finding with the exact error.
