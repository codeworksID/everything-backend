# Shared Backend Principles

Apply these principles across all backend design, implementation, and review work.

## Database

- **Normalize by default**: start at 3NF for transactional systems; eliminate repeating groups (1NF), partial dependencies on composite keys (2NF), and transitive dependencies (3NF).
- **Model facts once**: each fact has one canonical location; use junction tables for many-to-many relationships.
- **Prefer constraints over convention**: encode integrity with PRIMARY KEY, FOREIGN KEY, UNIQUE, CHECK, and NOT NULL.
- **Indexes follow query patterns**: justify composite index order; do not index every column blindly.
- **Denormalization is an exception**: only denormalize for measured read/performance needs and document the consistency mechanism.
- **ACID transactions for critical writes**: define transaction boundaries, concurrency strategy, and rollback plan.

## Code / Architecture

- **SOLID**: Single Responsibility, Open/Closed, Liskov Substitution, Interface Segregation, Dependency Inversion.
- **Layering and dependency direction**: transport → application → domain/ports → infrastructure; domain logic must not depend on HTTP, ORM, queue, or framework details.
- **DRY, KISS, YAGNI**: avoid duplication, keep it simple, and do not build speculative abstractions, services, or plug-in systems.
- **Depend on abstractions**: use interfaces/ports for repositories, external clients, clocks, ID generators, queues, and configuration.
- **Thin transport layer**: controllers/handlers parse input, call use cases/services, and map output/errors; they contain no business rules or transaction orchestration.
- **Services own business workflow and invariants**; repositories are persistence-only adapters.
- **Errors are typed and intentional**: use domain/application errors for expected failures and map them centrally to responses.

## API

- **RESTful by default**: prefer resource-oriented URLs, standard HTTP methods, and plural nouns.
- **Idempotency and retry safety**: GET, PUT, and DELETE should be naturally idempotent; use idempotency keys for critical POST flows.
- **Validation at the boundary**: validate path params, query params, headers, and body payloads before business logic runs.
- **Authorization is part of the contract**: define who can call each endpoint; prefer RBAC and resource ownership checks.
- **Consistency and operability**: standardize error responses, pagination, filtering, sorting, versioning, and rate limiting.
- **Secure-by-default responses**: never expose secrets, internal stack traces, or fields clients do not need; require encryption in transit.

## System

- **Observability is mandatory**: structured logs with correlation IDs, metrics, health/readiness checks, and traces for cross-service flows.
- **Fail predictably**: define retries, dead-letter behavior, and idempotency for every async path.
- **Cache is a performance tool, not a consistency tool**: never rely on cache for authoritative state.
- **Config is code**: validate at boot and fail fast on missing or invalid values.
- **Async messaging**: idempotent consumers, acknowledge only after success, bounded retries with backoff, and dead-letter queues for permanent failures.
- **Operational concerns are part of design**: document transaction boundaries, error taxonomy, authorization boundaries, scaling assumptions, and failure modes.

## Security

- **Secure by default**: require HTTPS, use strong password hashing (argon2id, bcrypt, or scrypt), and encrypt secrets at rest and in transit.
- **Least privilege and RBAC**: design role-based access control and resource ownership checks from the start.
- **Audit logging**: log privileged actions, money movement, state transitions, and destructive operations; exclude passwords, tokens, and secrets.
- **Input validation and sanitization**: reject malformed input and sanitize before business processing and logging.
- **Secrets management**: load secrets from environment variables or secret managers; rotate keys; never commit credentials.
- **Transport security**: use `Secure`, `httpOnly`, and `SameSite` cookie attributes; set security headers; restrict CORS origins.
