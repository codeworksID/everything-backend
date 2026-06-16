---
name: backend-deploy
description: "Own deployment and infrastructure setup for backend projects. Use this skill when the user says 'deploy', 'Docker', 'CI/CD', 'GitHub Actions', 'GitLab CI', 'Kubernetes', 'docker-compose', or 'infrastructure'. Generates container configs, local orchestration, pipeline templates, health checks, environment promotion, and deployment decision trees."
---

# Backend Deploy

## When to Activate

- User wants to deploy a backend or set up infrastructure
- User mentions Docker, docker-compose, containerization, or multi-stage builds
- User asks about CI/CD, GitHub Actions, GitLab CI, or automated deploy pipelines
- User mentions Kubernetes, K8s, Helm, or container orchestration
- User asks about dev/staging/prod environments, secrets, or environment promotion
- User asks about readiness/liveness probes, graceful shutdown, or health checks
- User asks whether to use containers, serverless, or a PaaS

## Prerequisites

- REQUIRED: project root confirmed and readable
- REQUIRED: `_shared/principles.md` loaded (Security section at minimum)
- REQUIRED: manifest files read to detect stack
- RECOMMENDED: `.opencode/everything-backend-memory/tech-stack.md` exists and is non-empty
- RECOMMENDED: `.opencode/everything-backend-memory/project-overview.md` exists
- RECOMMENDED: `db-schema.md` exists to know required backing services
- If any REQUIRED prerequisite fails, stop and ask the user for the missing item or run `backend-scan` automatically if a project path is known.

## Required Context (load in order; stop if context budget is tight)

1. REQUIRED: `_shared/principles.md` → only relevant sections (Code/Architecture and System for deploy)
2. REQUIRED: `tech-stack.md` (small, essential)
3. REQUIRED: `project-overview.md`
4. OPTIONAL: `db-schema.md` (useful for deploy)
5. OPTIONAL: `api-patterns.md` (useful for deploy)
6. OPTIONAL: `decisions.md` (only if prior decisions matter)
7. SKIP: `issues.md` unless reviewing risks

## Context Loading

Read memory files before generating deployment artifacts. For canonical backend principles, see `_shared/principles.md`; for tool rules, see `_shared/tool-rules.md`.

- `project-overview.md` - project type, structure, entry points
- `tech-stack.md` - language, framework, database, cache, ORM
- `db-schema.md` - required services (DB, cache, queue)
- `decisions.md` - prior architecture or hosting decisions
## Containerization

### Dockerfile Template

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm ci --only=production

FROM node:20-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
EXPOSE 3000
USER node
CMD ["node", "dist/main.js"]
```

### Dockerfile Rules

- Use multi-stage builds with pinned base image versions
- Run as a non-root user; install only production deps in the final stage
- Respect `.dockerignore` and copy only required files per stage
- Expose the application port explicitly

### .dockerignore Template

```text
node_modules
.git
.env*
!.env.example
dist
Dockerfile
docker-compose*.yml
*.md
```

## Local Orchestration

### docker-compose.yml Template

```yaml
version: "3.8"
services:
  app:
    build: .
    ports: ["3000:3000"]
    env_file: .env
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_started
  db:
    image: postgres:16-alpine
    env_file: .env
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 5s
      retries: 5
  cache:
    image: redis:7-alpine
volumes:
  postgres_data:
```

### Local Orchestration Rules

- Use `depends_on` with healthchecks for DB-backed startup ordering
- Keep secrets out of compose files; load from `.env`
- Provide `docker-compose.override.yml` for local-only overrides

## CI/CD Pipeline

### GitHub Actions Template

```yaml
name: CI/CD
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run test:ci
      - run: npm run build
  build-and-push:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: docker/setup-buildx-action@v3
      - uses: docker/login-action@v3
        with:
          registry: ghcr.io
          username: ${{ github.actor }}
          password: ${{ secrets.GITHUB_TOKEN }}
      - uses: docker/build-push-action@v5
        with:
          context: .
          push: true
          tags: ghcr.io/${{ github.repository }}:${{ github.sha }}
```

### GitLab CI Template

```yaml
stages: [test, build]
test:
  image: node:20-alpine
  script:
    - npm ci
    - npm run lint
    - npm run test:ci
build:
  stage: build
  image: docker:24
  services: [docker:24-dind]
  script:
    - docker build -t $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA .
    - docker push $CI_REGISTRY_IMAGE:$CI_COMMIT_SHA
  only: [main]
```

### CI/CD Rules

- Run lint, tests, and build before creating artifacts
- Build images only after tests pass; tag with commit SHA
- Use registry caching; keep deployment credentials in CI secrets

## Health Checks

### Required Endpoints

- `GET /health/live` - liveness; cheap 200 when the process is running
- `GET /health/ready` - readiness; 200 only when dependencies are healthy

### Readiness + Shutdown Template

```typescript
app.get('/health/ready', async (req, res) => {
  const checks = await Promise.all([db.ping(), cache.ping()]);
  const ok = checks.every(c => c.ok);
  res.status(ok ? 200 : 503).json({
    status: ok ? 'ready' : 'not_ready',
    checks,
  });
});

const server = app.listen(port);
const shutdown = (signal: string) => {
  server.close(() => {
    Promise.all([db.disconnect(), cache.disconnect()])
      .then(() => process.exit(0))
      .catch(() => process.exit(1));
  });
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
```

### Health Check Rules

- Liveness must be cheap; readiness may check dependencies
- Return 503 from readiness if required downstream services are unreachable
- Stop accepting new connections before closing DB connections

## Environment Promotion

Use three configuration layers: base config in the repo, runtime values from secrets managers or CI variables, and per-environment overrides only when necessary.

### .env.example Template

```text
NODE_ENV=development
PORT=3000
DATABASE_URL=postgresql://user:pass@localhost:5432/app
REDIS_URL=redis://localhost:6379
JWT_SECRET=replace-in-production
LOG_LEVEL=info
```

### Promotion Rules

- Build the container image once; promote the same image across environments
- Keep environment-specific values out of the container image
- Inject secrets via Docker secrets, Kubernetes secrets, or CI secret variables
- Require manual approval or branch protection for production deploys

## Decision Trees

### Containers vs Serverless vs PaaS

| Scenario | Recommendation |
|----------|----------------|
| Predictable traffic, long-running HTTP | Containers (Docker / K8s) |
| Sporadic or event-driven workloads | Serverless functions |
| Small team, no ops capacity | Managed PaaS |
| Multi-service with shared resources | Containers on a host or managed K8s |
| Strict latency and scaling requirements | Containers with autoscaling |

### When to Add Kubernetes

- 3+ independently deployable services
- Need automated rollouts, rollbacks, and health-based restarts
- Require horizontal pod autoscaling or resource quotas
- Team can handle the operational complexity or uses a managed offering
