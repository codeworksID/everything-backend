# Patterns and Stacks

Read this when choosing the architecture pattern (Step 3) or the stack (Step 4).

## Precedence Order

Apply the rules in this order. An earlier rule wins over a later one.

1. **Hard constraints**: compliance, data residency, an existing platform the team must use, budget ceilings.
2. **Correctness and security needs**: ACID requirements, audit trail, tenant isolation.
3. **Team shape**: team size, number of teams, and the stack they know.
4. **Domain boundaries**: how stable and well understood the module boundaries are.
5. **Scale and latency targets**: measured or stated numbers only, not hopes.
6. **Cost and speed of delivery**.

Default when nothing forces otherwise: a monolith, or a modular monolith when the domain has several business capabilities.

## Patterns

| Pattern | Choose when | Main costs |
|---|---|---|
| Monolith | Small team (1-5), simple domain, fast start | Boundaries erode without discipline |
| Modular monolith | Several business capabilities, one or a few teams, want clean boundaries without distributed systems | Needs enforced module rules (no reaching into another module's tables or internals) |
| Microservices | Several teams that must deploy independently, stable boundaries proven in a modular monolith, parts with very different scaling or runtime needs | Network failures, distributed tracing, data consistency, more ops work |
| Serverless | Event-driven or spiky load, low baseline traffic, cost focus | Cold starts, execution limits, vendor lock-in, DB connection limits (use a pooler or proxy) |

Microservices are never chosen for scale alone. A stateless monolith scales horizontally behind a load balancer.

## Decision Trees

These refine the pattern; they do not override the precedence order.

### High scalability needed

1. Scale stateless app instances horizontally first.
2. Add caching for hot reads (cache is never the source of truth).
3. Add read replicas, then partition or shard only when a measured bottleneck requires it.
4. Move slow work to background jobs or queues.
5. Consider extracting a service only for a component whose scaling needs differ sharply from the rest, and only when its boundary is stable.

### Real-time features needed

- Server-to-client updates only: Server-Sent Events (simpler, works over plain HTTP, resumes with Last-Event-ID).
- Two-way messaging: WebSockets.
- Multiple instances: fan out through a pub/sub layer (e.g. Redis pub/sub or a broker).
- Plan connection management: heartbeats, reconnection, origin checks, auth on connect, backpressure limits, draining on deploy.

### Data-heavy or analytics workloads

- Keep reporting queries off the primary: use a read replica first.
- For large batch or analytical work, plan an export or change-data-capture pipeline into a separate store.
- Keep PII out of analytics stores unless it is needed and governed.
- Language choice follows the team; pick a data-oriented stack (e.g. Python) only when the workload needs its libraries.

### Small team or quick start

- Monolith or modular monolith.
- The language the team knows best.
- Managed services (managed database, managed queue) over self-hosted.
- No speculative abstractions, services or plug-in systems.

### Complex domain, small team

- Modular monolith first.
- Split modules by business capability; define ports early.
- Delay service extraction until boundaries prove stable; write the extraction triggers into the ADR.

### Compliance, money, or critical workflows

- Explicit audit trail design.
- Transaction and consistency rule for every write use case.
- Authorization model with least privilege and tenant scoping (backend-auth).
- Failure-mode and rollback documentation; backup and restore targets (backend-ops).
- Threat model and review (backend-security).

### Multi-tenant SaaS

Record the tenancy model as an ADR:

- Shared schema with a tenant id on every tenant-owned table (cheapest; needs tenant-scoped queries, row-level security or scoped repositories, and cross-tenant negative tests).
- Schema per tenant (stronger isolation; migration fan-out cost).
- Database per tenant (strongest isolation; highest ops cost).

## Stack Selection Criteria

Choose by criteria, then by team familiarity. Use the current LTS/stable release unless the project already pins a version.

| Ecosystem | Typical frameworks | Strengths | Watch for |
|---|---|---|---|
| Node.js / TypeScript | Fastify, Express, NestJS | Fast delivery, shared language with frontend, large ecosystem | CPU-bound work blocks the event loop |
| Python | FastAPI, Django | Data and ML libraries, fast prototyping, auto OpenAPI (FastAPI) | Raw throughput per instance |
| Go | net/http, Gin, Echo | Low memory, high concurrency, simple deploys | More hand-written code |
| Java / Kotlin | Spring Boot, Ktor | Mature enterprise ecosystem, strong typing | Heavier runtime and startup |
| C# / .NET | ASP.NET Core | Strong performance and tooling | Smaller open-source ecosystem in some niches |
| Ruby | Rails | Very fast CRUD delivery | Throughput per instance |
| PHP | Laravel | Fast CRUD delivery, cheap hosting | Long-running workers need care |
| Rust | Axum, Actix | Highest performance and safety | Slower delivery, smaller hiring pool |

### Protocol

| Need | Protocol |
|---|---|
| Public or general-purpose API | REST (default) |
| Many client shapes over a rich graph | GraphQL |
| Internal service-to-service with strict contracts | gRPC |
| Server push | SSE |
| Two-way real time | WebSockets |

Framework examples: GraphQL with Apollo Server (Node.js, supports federation), Strawberry (Python) or gqlgen (Go, code generation); WebSockets with Socket.IO or ws (Node.js) or a native library such as gorilla/websocket or coder/websocket (Go).

Detailed contract design belongs to backend-api-design.

### Data stores

| Need | Choice |
|---|---|
| Transactions, relations, reporting | PostgreSQL or MySQL (default: PostgreSQL) |
| Flexible documents with weak relations | MongoDB or a JSON column in PostgreSQL |
| Cache, rate limits, ephemeral state | Redis or a compatible store |
| Full-text search at scale | A search engine (only when database full-text search is not enough) |
| Vector similarity | A vector extension of the primary database first (e.g. pgvector), a dedicated store only at scale |

Detailed schema design belongs to backend-db-design.

### Messaging

| Need | Choice |
|---|---|
| Background jobs in one app | A job queue backed by the database or Redis |
| Events consumed by several services | A message broker |
| Replayable event log, high throughput | A log-based broker (Kafka-style) |
| Publish reliably after a database write | Transactional outbox (backend-ops) |

Add a broker only when a requirement needs it. Queue and outbox implementation details belong to backend-ops.
