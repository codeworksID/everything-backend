# Async Processing and Messaging

## Delivery Semantics

Assume **at-least-once** delivery. Nearly every queue and broker redelivers a message when a consumer crashes, times out or loses its connection before acknowledging. "Exactly-once" features (for example Kafka transactions) cover only specific read-process-write paths inside that system; side effects outside it (DB writes, emails, payments) still need deduplication. Design every consumer to be safe when a message arrives twice.

## Job Queues, Pub/Sub and Streams

| Pattern | Use | Examples |
|---|---|---|
| Job queue | background tasks, delays, retries, rate limits | BullMQ (Node), Celery, RQ, Dramatiq (Python), Sidekiq (Ruby), River, Asynq (Go), SQS |
| Pub/sub | broadcast events to independent consumers | SNS, Google Pub/Sub, RabbitMQ fanout/topic exchanges, Redis pub/sub (no persistence) |
| Stream / log | ordered events, replay, many consumer groups | Kafka, Redpanda, Kinesis, Redis Streams, NATS JetStream |

```
Single producer, single consumer, retries needed?      -> job queue
Fan-out to many consumers, no ordering needed?         -> pub/sub topic
Ordered events per key, replay, audit trail?           -> stream with partition keys
Must publish only if the DB write commits?             -> outbox + any of the above
```

## Consumer Rules

1. **Idempotent handling.** Make the side effect idempotent (upsert, conditional update, unique constraint) or deduplicate with an inbox table (below).
2. **Acknowledge after success.** Ack or commit the offset only after processing and persistence finish. Disable auto-ack (`noAck: true`, `auto_ack=True`) and auto-commit-before-processing.
3. **Visibility timeout / ack deadline.** It controls when an unacknowledged message is redelivered. It does not prevent double processing: if processing takes longer than the timeout, a second consumer gets the same message while the first is still working. Set it above the p99 processing time and extend it for long jobs.
4. **Bounded retries** with exponential backoff and jitter (see `resilience.md` -> Retries). Do not retry validation errors.
5. **Poison messages go to a dead-letter queue** after the retry limit, with the error, attempt count and original metadata. Alert on DLQ depth and provide a replay procedure.
6. **Timeouts inside the handler** for every remote call, shorter than the visibility timeout.

Example policy:

```
retry_policy:
  max_attempts: 5
  backoff: exponential
  initial_delay: 1s
  max_delay: 60s
  jitter: full
  retry_on: transient errors only

on_permanent_failure:
  move_to: dlq
  alert: true
  replay: documented in docs/runbooks/<queue>-dlq.md
```

## Inbox (Deduplication) Table

```sql
CREATE TABLE inbox_messages (
  consumer     text        NOT NULL,
  message_id   text        NOT NULL,
  processed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (consumer, message_id)
);
```

In the same transaction as the side effect: `INSERT ... ON CONFLICT DO NOTHING`; if no row was inserted, the message was already processed, so skip it and ack. Purge rows older than the broker's maximum redelivery window.

## Ordering and Partitioning

- Most queues do not guarantee order, and retries reorder messages even when the broker does.
- When order matters per entity (one account, one order), route by a partition or group key (Kafka key, SQS FIFO `MessageGroupId`) and process one message per key at a time.
- Make handlers tolerate out-of-order arrival anyway: carry a version or timestamp and ignore events older than the stored state.

## Outbox Pattern

Use when a DB write and an event publish must both happen or both not happen.

1. In the business transaction, insert the event into an `outbox` table (id, aggregate id, type, payload, created_at, published_at null).
2. A relay reads unpublished rows, publishes them, then marks them published.
3. Run relays safely in parallel by claiming rows with `SELECT ... WHERE published_at IS NULL ORDER BY id LIMIT 100 FOR UPDATE SKIP LOCKED` inside a short transaction, or run a single elected relay. Alternatively use change data capture (Debezium or the provider's CDC) on the outbox table.
4. A crash between publish and mark causes the same event to be published again. That is expected at-least-once behavior; consumers deduplicate by event id.
5. Delete or archive published rows on a schedule to keep the table small.

## Metrics and Alerts

- Queue depth and **age of the oldest message** (age catches a stuck consumer that depth alone may not).
- Consumer lag per partition or group for streams.
- Processing duration (histogram), success and failure counts, retry count.
- DLQ depth; alert when it grows.
- Outbox: count of unpublished rows and age of the oldest one.

## Audit Checklist

- Auto-ack or ack before processing.
- Consumers with no idempotency or dedup.
- No DLQ, or a DLQ nobody monitors.
- Visibility timeout shorter than processing time.
- Outbox relay without `SKIP LOCKED` or leader election when more than one instance runs it.
- No lag or oldest-message-age metric.
- Job libraries: on Node, BullMQ is the maintained successor of Bull; flag new code on Bull.
