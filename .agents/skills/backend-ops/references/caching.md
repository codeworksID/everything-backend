# Caching

Cache to cut latency or load on a measured hot path. Every cache adds a consistency problem, so start by writing down how stale each value may be.

## Cache Layers

| Layer | Use | Watch out for |
|---|---|---|
| In-process (bounded LRU/LFU) | hot, small, read-mostly data on one instance | each instance has its own copy; invalidation does not reach other instances; bound the size |
| Distributed (Redis, Valkey, Memcached) | shared state across instances, explicit TTL | network hop, eviction policy (`maxmemory-policy`), memory limits |
| CDN / reverse proxy | static assets, public GET responses | must never cache personalized or authenticated responses |
| HTTP cache headers | browser and proxy caching of reads | `Cache-Control` must match who may see the response |

## Key Design

- Include a version prefix, the resource type and every parameter that changes the result: `v1:users:{id}`, `v1:orders:list:{tenant_id}:{query_hash}`.
- **Scope keys to the tenant and, for per-user data, the principal.** A key built only from a resource id or a query string leaks one user's data to another. If the response depends on the caller's permissions, the permission scope (user id or role set) is part of the key, or the data is not cached.
- Hash long or unbounded parameters; keep key cardinality bounded.
- Bump the version prefix when the cached value's shape changes, so old and new code never read each other's entries during a rolling deploy.

## Invalidation Strategies

| Strategy | How | Consistency |
|---|---|---|
| TTL only | entry expires after a fixed time | stale up to the TTL; simplest |
| Cache-aside (lazy loading) | read: cache, else DB then set. write: commit to DB, then delete the key | stale window between commit and delete; races can re-populate an old value |
| Write-through | write path updates DB and cache together | not automatically consistent: if one write fails, or two writers interleave, the cache and DB diverge. Always keep a TTL as a backstop |
| Write-behind | write to cache, flush to DB asynchronously | risk of data loss on cache failure; avoid for data you cannot lose |
| Event-based | consume change events (outbox, CDC) and delete or update keys | eventual; depends on event delivery |

Rules:
- On writes, commit the DB transaction first, then delete the key. Deleting before the commit lets a concurrent reader re-cache the old value.
- Prefer delete over update on writes; the next read repopulates.
- Keep a TTL on every entry, even with explicit invalidation, so a missed invalidation heals itself.
- For strict read-after-write needs, read through to the DB for that user after their own write, or do not cache that value.

## Stampede Protection

- Single-flight: only one process recomputes a missing key; others wait briefly or serve stale. Use an in-process single-flight for one instance, a short-lived distributed lock (`SET key value NX PX ms`) across instances.
- Add jitter to TTLs (for example plus or minus 10%) so keys written together do not expire together.
- Stale-while-revalidate: serve the old value while one worker refreshes it, when the staleness is acceptable.
- Probabilistic early refresh for very hot keys: refresh slightly before expiry with a probability that rises as expiry approaches.

## HTTP Caching Headers

- Public, non-personalized reads: `Cache-Control: public, max-age=60` plus `ETag` or `Last-Modified`.
- Authenticated or personalized responses: `Cache-Control: private, no-store` (or `private, max-age=...` only when the browser may cache it). Never `public`.
- Responses that vary by a header (language, encoding) need `Vary` for that header. `Vary: Authorization` is not a safe substitute for `private` at a CDN.

## Choosing a Cache Strategy

```
Is the value safe to serve stale, and for how long?
  NO  -> do not cache, or cache only per-request
  YES -> continue

Read-heavy, low mutation?
  YES -> cache-aside with TTL (commit, then delete on write)
  NO  -> short TTL, or event-based invalidation from the outbox or CDC

Shared across instances?
  YES -> distributed cache
  NO  -> bounded in-process LRU

Expensive to recompute and frequently requested?
  YES -> add single-flight and TTL jitter
```

## Audit Checklist

- Cache writes without a TTL.
- Keys missing tenant or user scope on per-user data.
- Invalidation that runs before the DB commit.
- `Cache-Control: public` on authenticated routes.
- No hit-ratio, eviction or memory metrics for the cache.
