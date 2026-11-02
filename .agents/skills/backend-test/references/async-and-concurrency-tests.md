# Async, Idempotency and Concurrency Tests

Read this when testing queue consumers, retries and dead-letter queues, webhooks, scheduled jobs, idempotency keys, concurrent writes, or transaction rollback. These behaviors are required by `<shared>/principles.md`; untested, they fail only in production.

## General Rules

- Wait on conditions, not on time. Poll for the expected state with a timeout (e.g. up to 5s, every 50ms) instead of `sleep(2000)`. A fixed sleep is both slow and flaky.
- Drive scheduled and delayed work with an injected clock or fake timers, not real waiting.
- Prefer calling the handler directly with a message for unit tests. Use a real broker (a Testcontainers container this run started) only for integration tests of wiring, acknowledgement and redelivery.
- Assert side effects by re-reading state (database rows, outbox entries, messages published to a fake producer), not by checking that a function was called.

## Queue Consumers and Background Jobs

| Case | Expected |
|---|---|
| Valid message | effect applied once; message acknowledged |
| Same message delivered twice (same message or event ID) | effect applied once; second delivery acknowledged without side effects |
| Handler fails with a transient error | message retried per policy (count, backoff) |
| Handler keeps failing past the retry limit | message moves to the dead-letter queue (or the failure store) with the error recorded; nothing partial is committed |
| Malformed or unknown-version message (poison message) | rejected to the DLQ without retry loops; the consumer keeps processing other messages |
| Out-of-order delivery, when ordering matters | older event does not overwrite newer state (version or timestamp check) |
| Outbox pattern | the outbox row is written in the same transaction as the state change; when the transaction rolls back, no outbox row exists |

## Webhooks (incoming)

| Case | Expected |
|---|---|
| Valid signature | accepted |
| Missing or wrong signature | 401 or 400; no side effects |
| Timestamp outside the allowed window (replay) | rejected |
| Same event ID delivered twice | processed once; second returns success without side effects |

Build signatures in a test helper with a test-only secret.

## Idempotency Keys

| Case | Expected |
|---|---|
| First request with key K | processed; response stored |
| Repeat with key K and the same body | same status and body as the first; no second side effect (one row, one charge, one message) |
| Repeat with key K and a different body | rejected (409 or 422, as designed) |
| Two concurrent requests with key K | exactly one side effect; the other waits for and returns the stored response, or gets 409, as designed |
| Key after its retention window | treated as new, as designed |

## Concurrency and Invariants

Run the competing operations at the same time and assert the invariant afterwards.

```typescript
it("never oversells stock", async () => {
  const product = await createProduct({ stock: 1 });
  const results = await Promise.allSettled(
    Array.from({ length: 10 }, () => request(app).post(`/orders`).send({ productId: product.id, qty: 1 })),
  );
  const created = results.filter(r => r.status === "fulfilled" && r.value.status === 201);
  expect(created).toHaveLength(1);
  expect((await getProduct(product.id)).stock).toBe(0);
});
```

```python
async def test_never_oversells_stock(client, product_with_stock_1):
    responses = await asyncio.gather(*[
        client.post("/orders", json={"product_id": product_with_stock_1.id, "qty": 1})
        for _ in range(10)
    ])
    assert sum(r.status_code == 201 for r in responses) == 1
```

Cases to cover where the code has them:

- Counters, balances and stock never go negative or double-count under parallel requests.
- Unique constraints hold under a race (two parallel signups with the same email: one succeeds, the other gets the documented conflict, never a 500).
- Optimistic locking: an update with a stale version is rejected (409) and does not overwrite the newer write.
- Pessimistic locking or `SELECT ... FOR UPDATE` paths: the second writer waits or fails as designed, without deadlocking the test.
- Go: run these with `-race`. JVM: use a `CountDownLatch` or barrier so threads start together.

These tests need a real database: an in-memory fake has no locking or constraints. Run them against the disposable test database, with an isolation approach that allows several connections (truncate or per-worker database; transaction-rollback isolation usually does not).

## Transactions and Rollback

- A failure in the middle of a multi-step write leaves no partial data: force the second step to fail (fake that throws, constraint violation) and assert the first step's rows are absent.
- Side effects outside the database (emails, published events, external calls) do not happen when the transaction rolls back, or happen only through the outbox.
- Retries of a whole operation after a rollback do not duplicate effects.
