# Review Templates

Read this in Step 5 (normalization and index review) and Step 8 (presenting the design). Copy the blocks into the design summary and fill them in.

## Normalization Review

```markdown
## Normalization Review

### 1NF
- [ ] Every column holds one atomic value (no lists in strings, no repeating column groups)

### 2NF
- [ ] No non-key column depends on only part of a composite key
- [ ] Junction tables hold only attributes of the relationship

### 3NF
- [ ] No non-key column depends on another non-key column
- [ ] Lookup or reference data extracted where it carries attributes or changes
- [ ] Derived or summary data is not stored unless justified below

### Denormalization Exceptions
| Table.column | Duplicates or derives | Measured reason | How it stays correct |
|---|---|---|---|
```

## Index Strategy

```markdown
## Index Strategy

| Query pattern (from Step 2) | Columns filtered / sorted | Proposed index | Why this order |
|---|---|---|---|
| Published posts, newest first | status =, published_at DESC | (status, published_at DESC) | Equality before range or sort |
| Posts by author | user_id = | (user_id) | FK column; also speeds parent deletes |
```

Rules:
- Index columns used in frequent filters, joins, uniqueness checks and sorts.
- Composite index order: equality columns first, then range or sort columns.
- In PostgreSQL, index FK columns (they are not indexed automatically).
- A unique constraint already creates an index; do not add a second one on the same columns.
- No speculative indexes. Every index names the query it serves.
- On write-heavy tables, count the indexes and justify each.

## Constraint and Key Summary

```markdown
## Keys and Constraints

| Table | Primary key | Candidate / business keys | Foreign keys (ON DELETE) | CHECK / NOT NULL notes |
|---|---|---|---|---|
| posts | id (uuid) | slug | user_id -> users (RESTRICT), category_id -> categories (SET NULL) | status in (draft, published, archived) |
```

## Transaction Boundaries

```markdown
## Critical Write Flows

| Flow | Statements in one transaction | After commit (outbox) | Concurrency strategy |
|---|---|---|---|
| Checkout | insert order, insert items, reserve inventory | order.created event, email | inventory CHECK >= 0 + FOR UPDATE |
```
