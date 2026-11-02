# Domain Patterns

Read this when the feature matches one of the common domains below. These are starting points; confirm every entity with the user in Step 2. Column rules (keys, timestamps, money, soft delete) are in `relational-rules.md`.

## Users and Accounts

- `users`: id, email, email_normalized (unique among live rows), status, timestamps, optional `deleted_at`.
- Credentials, sessions, refresh tokens, password resets, MFA and roles are designed by `backend-auth`. Ask it for its persistence needs and add those tables to this design. Do not invent a role column here.
- Personal data: classify columns and set a retention or erasure rule.

## Content Management

- `posts` (or `articles`), `categories` (1:N) and `tags` with a `post_tags` junction table (M:N, composite PK `(post_id, tag_id)`).
- Status: draft, published, archived (`CHECK` constraint). `published_at` set on publish.
- `slug` unique (per tenant if multi-tenant), immutable once published, or keep a redirects table.
- Author FK to `users` with `ON DELETE RESTRICT`; decide what happens to content when an author is erased (reassign or anonymize).
- Comments: `comments` with FKs to `posts` and `users`; index both FK columns.

## E-Commerce

- `customers`, `addresses`, `products`, `product_variants`, `inventory`, `orders`, `order_items`, `payments`.
- Money: integer minor units or `NUMERIC(19,4)` plus `currency CHAR(3)`; never float.
- `order_items` copies price, currency and product name at purchase time. That is a justified snapshot, not denormalization.
- Order status: pending, paid, shipped, delivered, cancelled, refunded. Record transitions in an `order_events` table if history matters.
- Transaction boundaries: checkout (order + items + inventory reservation) in one transaction; payment capture confirmed by an idempotent provider webhook keyed by the provider's event ID; inventory decrement guarded by `CHECK (quantity >= 0)` or `SELECT ... FOR UPDATE`.
- Payments: store the provider's payment ID and status, never card numbers.

## Real-Time and Messaging

- Sessions and presence: Redis with expiry; the primary store keeps only durable state.
- `conversations`, `conversation_members` (junction), `messages` (index `(conversation_id, created_at DESC)`, or a UUIDv7 id for keyset paging).
- Read receipts: per member `last_read_message_id` on `conversation_members`, not one row per message per reader.
- Typing indicators are ephemeral: pub/sub only, never stored.

## Audit Trail

- Append-only `audit_log`: actor_id, action, entity_type, entity_id, before, after, occurred_at, request_id.
- No UPDATE or DELETE grants for the app role. Partition by time when volume is high.
- Exclude secrets, tokens and password hashes from `before` and `after`.

## Events to Other Systems

- An `outbox` table written in the same transaction as the business change (id, aggregate_type, aggregate_id, event_type, payload, created_at, published_at). `backend-ops` owns the relay and consumer rules.

## Multi-Tenant SaaS

See `multi-tenancy.md`.

## Scale Notes

- High write load: batch inserts, keep indexes few, partition large append-only tables by time.
- High read load: read replicas, caching (derived, never authoritative), measured denormalization.
- Time-series: TimescaleDB on PostgreSQL or a dedicated store; partition by time.
- Search-heavy: a search engine fed from the primary store via outbox or CDC.
- Premature denormalization: keep 3NF until a measurement shows a bottleneck.
