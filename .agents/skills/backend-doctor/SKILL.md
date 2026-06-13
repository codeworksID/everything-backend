---
name: backend-doctor
description: "Run health checks on backend code covering code quality, security vulnerabilities, and performance issues. Scans the project, identifies issues with severity levels, and provides recommendations. Use this skill when the user says 'check my backend', 'health check', 'review code', 'doctor', or before deployment."
---

# Backend Doctor

## When to Activate

- User wants to check backend health
- User says "check my backend", "health check", "review code", "doctor"
- Before deployment or after major changes
- User asks "is my code secure?"
- User asks "are there performance issues?"

## Health Check Process

### Step 1: Project Scan

Use `explore` agents to:
- Read project structure
- Identify tech stack
- Find all source files
- Check for configuration files
- Read package manifests

### Step 2: Code Quality Check

#### Code Structure
- [ ] Proper separation of concerns (controllers, services, repositories)
- [ ] Consistent naming conventions
- [ ] Proper error handling
- [ ] Proper logging
- [ ] No god objects/classes
- [ ] Single responsibility principle

#### Code Smells
- [ ] Long functions (>50 lines)
- [ ] Deep nesting (>3 levels)
- [ ] Duplicate code
- [ ] Magic numbers/strings
- [ ] Dead code
- [ ] Unused imports/variables

#### Best Practices
- [ ] Input validation on all endpoints
- [ ] Output sanitization
- [ ] Error handling with proper status codes
- [ ] Security headers configured
- [ ] CORS configured properly
- [ ] Rate limiting in place

### Step 3: Security Check

#### Authentication
- [ ] Passwords hashed (bcrypt/argon2, not MD5/SHA1)
- [ ] JWT tokens have expiration
- [ ] Refresh token rotation implemented
- [ ] Session management secure
- [ ] OAuth implementation correct
- [ ] No credentials in code/logs

#### Authorization
- [ ] Role-based access control
- [ ] Permission checks on protected routes
- [ ] Resource ownership verification
- [ ] API endpoint protection
- [ ] Middleware validation

#### Data Protection
- [ ] SQL injection prevention (parameterized queries)
- [ ] XSS prevention (output encoding)
- [ ] CSRF protection
- [ ] Data encryption at rest
- [ ] Data encryption in transit (HTTPS)
- [ ] Input sanitization
- [ ] File upload validation

#### Dependencies
- [ ] No known vulnerabilities (run npm audit / pip audit)
- [ ] All packages up to date
- [ ] No unnecessary dependencies
- [ ] No deprecated packages
- [ ] License compliance

#### Secrets Management
- [ ] No secrets in code
- [ ] Environment variables used
- [ ] .env files gitignored
- [ ] Secrets not logged
- [ ] API keys rotated regularly

### Step 4: Performance Check

#### Database Performance
- [ ] No N+1 queries
- [ ] Indexes on frequently queried columns
- [ ] Query optimization (no SELECT *)
- [ ] Connection pooling configured
- [ ] Database query timeouts
- [ ] Appropriate use of transactions
- [ ] No missing indexes on foreign keys

#### API Performance
- [ ] Response time acceptable
- [ ] Payload sizes reasonable
- [ ] Pagination on list endpoints
- [ ] Caching where appropriate
- [ ] Compression enabled
- [ ] HTTP caching headers

#### Resource Usage
- [ ] No memory leaks
- [ ] CPU usage reasonable
- [ ] Connection limits configured
- [ ] File handles properly closed
- [ ] Graceful shutdown handling

#### Scalability
- [ ] Stateless design
- [ ] Horizontal scaling possible
- [ ] No single points of failure
- [ ] Load balancer ready
- [ ] Database connection limits

### Step 5: Report Generation

Generate a health report with overall score and detailed findings.

### Step 6: User Confirmation

Present health report and ask:
- "Which issues should I fix first?"
- "Any issues to ignore?"
- "Should I implement the fixes?"

**NEVER** auto-fix without explicit user approval.

## Decision Trees

### If security issues found:
- Prioritize Critical and High severity
- Provide specific fix instructions
- Consider immediate patches
- Recommend full security audit
- Add security tests

### If performance issues found:
- Prioritize database query issues
- Check for missing indexes
- Consider caching strategy
- Add pagination where missing
- Consider async processing

### If code quality issues found:
- Prioritize maintainability
- Consider refactoring
- Add missing tests
- Add documentation
- Update coding standards

### If dependency issues found:
- Update vulnerable packages
- Remove unused dependencies
- Pin versions for stability
- Check for breaking changes
- Add automated dependency scanning

## Templates

### Health Report Template
```markdown
# Backend Health Report

**Date**: [ISO timestamp]
**Project**: [Name]
**Overall Score**: [A/B/C/D/F]

## Summary
- **Critical Issues**: [N]
- **Warnings**: [N]
- **Recommendations**: [N]

## Critical Issues (Fix Immediately)

### 1. SQL Injection Vulnerability
- **File**: `src/repositories/user.ts:45`
- **Severity**: Critical
- **Category**: Security
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

## Warnings (Fix Soon)

### 1. Missing Database Index
- **File**: `prisma/schema.prisma:12`
- **Severity**: Warning
- **Category**: Performance
- **Description**: Email field is queried frequently but not indexed
- **Impact**: Slow user lookups, poor performance at scale
- **Recommendation**: Add unique index
  ```prisma
  model User {
    email String @unique
    @@index([email])
  }
  ```

## Recommendations (Consider)

### 1. Add Input Validation
- **File**: `src/controllers/user.ts:20`
- **Severity**: Info
- **Category**: Quality
- **Description**: No input validation on user creation endpoint
- **Impact**: Potential data integrity issues, security risks
- **Recommendation**: Add Zod schema validation
  ```typescript
  const CreateUserSchema = z.object({
    email: z.string().email(),
    password: z.string().min(8).max(100),
    name: z.string().min(1).max(100)
  });
  ```

## Scores by Category
| Category | Score | Notes |
|----------|-------|-------|
| Code Quality | B | Good structure, some long functions |
| Security | C | SQL injection found, weak auth |
| Performance | B | Missing indexes, no caching |
| Dependencies | A | All up to date |
| Testing | C | Low test coverage |
```

### Security Checklist Template
```markdown
## Security Checklist

### Authentication
- [ ] Password hashing (bcrypt/argon2)
- [ ] JWT expiration set
- [ ] Refresh token rotation
- [ ] Session management
- [ ] OAuth implementation
- [ ] No credentials in logs

### Authorization
- [ ] Role-based access control
- [ ] Resource ownership checks
- [ ] API endpoint protection
- [ ] Middleware validation
- [ ] Permission checks

### Data Protection
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection
- [ ] Input sanitization
- [ ] Output encoding
- [ ] File upload validation

### Network Security
- [ ] HTTPS enforced
- [ ] Security headers (HSTS, CSP, etc.)
- [ ] CORS configured
- [ ] Rate limiting
- [ ] DDoS protection

### Secrets Management
- [ ] No secrets in code
- [ ] Environment variables
- [ ] .env in .gitignore
- [ ] Secrets not logged
- [ ] API key rotation
```

### Performance Checklist Template
```markdown
## Performance Checklist

### Database
- [ ] Indexes on foreign keys
- [ ] Indexes on frequently queried columns
- [ ] No N+1 queries
- [ ] Connection pooling
- [ ] Query result limits
- [ ] Appropriate use of transactions

### API
- [ ] Response time < 200ms
- [ ] Pagination on lists
- [ ] Compression enabled
- [ ] Caching headers
- [ ] Caching for expensive operations

### Application
- [ ] Async I/O
- [ ] No blocking operations
- [ ] Memory usage bounded
- [ ] CPU usage reasonable
- [ ] Graceful shutdown

### Scalability
- [ ] Stateless design
- [ ] Horizontal scaling
- [ ] No single point of failure
- [ ] Load testing done
```

## Edge Cases

- **No code to check**: Run `backend-discovery` first
- **Large codebase**: Focus on critical paths first, sample other areas
- **Legacy code**: Be lenient with warnings, focus on critical security issues
- **Multiple languages**: Check each separately, compare against language-specific best practices
- **No memory files**: Suggest running `backend-discovery` to get context
- **Third-party dependencies**: Note as external risk, recommend dependency scanning
