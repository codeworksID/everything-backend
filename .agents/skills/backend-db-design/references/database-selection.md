# Database Selection

Read this only when no database is recorded yet. If `tech-stack.md` or `decisions.md` already names a primary database, or `backend-architect` recorded one, use it. Do not propose a switch mid-feature. If you believe the recorded choice is wrong for the new need, say so and ask; do not change it yourself.

## Map Requirements to a Store

Use the Step 2 answers (data shape, relationships, access patterns, scale, consistency):

| Requirement signal | Default choice |
|---|---|
| Relational data, joins, multi-row transactions, reporting | PostgreSQL |
| Relational web app on an existing MySQL estate or managed MySQL | MySQL 8 (InnoDB, utf8mb4) |
| Deeply nested, self-contained documents read and written as a whole; schema varies per record | MongoDB |
| Cache, sessions, rate limits, short-lived queues, pub/sub | Redis, next to a primary store |
| Time-series metrics or events at high ingest | PostgreSQL with TimescaleDB, or a dedicated time-series store |
| Full-text or faceted search beyond basic needs | A search engine (OpenSearch/Elasticsearch, Meilisearch) fed from the primary store |

When in doubt, choose PostgreSQL. It covers relational data, JSON columns (`jsonb`), full-text search and most queue-like needs at small scale.

## Store Notes

### PostgreSQL
- Strengths: rich types (`jsonb`, arrays, ranges, `citext`, `timestamptz`), partial and expression indexes, transactional DDL, row-level security.
- Watch for: write scaling is mostly vertical plus read replicas; plan partitioning for very large tables.
- Stack specifics: see `<shared>/stacks/postgres.md`.

### MySQL
- Strengths: wide hosting support, simple replication, fast primary-key lookups (InnoDB clusters rows by PK).
- Watch for: no partial indexes (use a generated column, see `schema-templates.md`); CHECK constraints are enforced only from 8.0.16; DDL is not transactional, so a failed multi-statement migration can leave partial changes.
- Always use `utf8mb4` and an explicit collation. Legacy `utf8` (`utf8mb3`) cannot store 4-byte characters such as emoji.
- Random UUIDv4 primary keys fragment the clustered index. Use `BIGINT` auto-increment or time-ordered UUIDv7 stored as `BINARY(16)`.

### MongoDB
- Strengths: flexible documents, horizontal sharding, natural fit for aggregates read as a unit.
- Facts: single-document writes are atomic, and multi-document ACID transactions exist on replica sets and sharded clusters (since 4.0 and 4.2). Consistency depends on read and write concerns; use `majority` for data that must not be lost or read stale.
- Watch for: joins via `$lookup` are costly, so model around access patterns; add a `$jsonSchema` validator so documents do not drift.

### Redis
- Use for cache, sessions, rate limiting, locks with expiry, streams or simple queues.
- Not a primary store for authoritative data unless persistence (AOF) and the failure modes are accepted and recorded in `decisions.md`.

## Polyglot Rules

- One primary store owns each fact. Caches and search indexes are derived and rebuildable.
- Feed derived stores from the primary with an outbox or change data capture, not dual writes from request handlers. See `backend-ops` for the outbox pattern.

## Record the Choice

Append a decision to `decisions.md` (Context, Decision, Consequences, Status: Accepted) naming the store, the version line (current stable release unless the project pins one) and why the alternatives lost.
