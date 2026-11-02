---
name: backend-db-design
description: Designs database schemas for backend features, covering tables or collections, keys, relationships, indexes, constraints, transaction boundaries and multi-tenant isolation, for PostgreSQL, MySQL, MongoDB and Redis. Produces a target schema, an ERD draft and an ordered migration plan, and hands the plan to backend-migrate, which writes and applies the migrations. Use when the user says "design the database", "create a schema", "plan the tables", "model this data", "what tables do I need", "which database should I use", "add a table for", or starts a feature that stores new data.
---

# Backend DB Design

Design the target schema for a feature, review it, and hand an ordered migration plan to `backend-migrate`.

## When to Use

- The user asks to design a schema, plan tables or collections, or model data.
- A new feature stores data that has no table yet.
- The user asks which database to use and none is recorded.
- `backend-implement` or `backend-auth` reports missing persistence (loop-back).

Not for: writing or applying migration files (`backend-migrate`), changing existing tables in place without a design question (`backend-migrate`), rendering or saving diagrams (`backend-visualize`), system-level architecture (`backend-architect`).

> **Boundary**: this skill produces the target schema and a migration PLAN. It never writes or applies migration files. `backend-migrate` is the only skill that writes and applies migrations.

## Before You Start

1. Resolve the shared docs folder ("<shared>"): first `_shared/` inside this skill's folder (bundled installs, e.g. Claude.ai), then `../_shared/` next to it; other fallbacks are in `<shared>/context-loading.md` -> Resolving `_shared/` Files. A missing shared doc is a warning, not a stop.
2. Read `<shared>/tool-rules.md` (mode=auto contract, checkpoints), `<shared>/principles.md` (Database and Security sections) and `<shared>/memory-schema.md` (db-schema.md and decisions.md formats). Read `<shared>/host-tools.md` if the actions below don't map clearly to your host's tools.
3. Load project memory per `<shared>/context-loading.md`: always `project-overview.md`, `tech-stack.md`, `db-schema.md` and `decisions.md`; `api-patterns.md` only if the design touches endpoints. If memory is missing or stale, suggest `backend-scan` and continue from the live code; create `db-schema.md` from the schema in `<shared>/memory-schema.md` when you save the design.
4. If the detected stack matches a file in `<shared>/stacks/`, read it (for PostgreSQL: `<shared>/stacks/postgres.md`).

This skill writes only memory files. Start a checkpoint before the first memory write: `node <shared>/scripts/checkpoint.js start --skill backend-db-design --feature <slug>`. Record each memory file you change (`checkpoint.js record --skill backend-db-design --feature <slug> --memory <file>`) and close it when done (`checkpoint.js close --skill backend-db-design --feature <slug>`). If it exits with code 3, an open checkpoint exists: offer to resume or restart. If Node is unavailable, follow `<shared>/tool-rules.md` -> Concurrent & Partial Work by hand.

## Workflow

### Step 1: Inspect the Existing Schema

Memory is a summary; the live code wins (see `<shared>/memory-schema.md` -> conflict rules).

1. Find schema sources: ORM schema files (`schema.prisma`, Drizzle schema, model or entity classes, `models.py`, `db/schema.rb`), migration folders (`migrations/`, `prisma/migrations/`, `db/migrate/`, `alembic/versions/`, `supabase/migrations/`) and raw `.sql` files.
2. Read the latest schema and a few recent migrations.
3. Extract conventions: naming, PK type and generation, timestamp type, soft-delete style, tenancy column, enum style, migration tool and file naming.
4. Compare with `db-schema.md`. Note conflicts and log them as the conflict rules in `<shared>/memory-schema.md` say.

Do not connect to a database to inspect it unless the user asks; if they do, use read-only queries and follow `<shared>/tool-rules.md` -> Production Targets.

Output: a short "Current schema and conventions" note. Greenfield projects: say so and skip.

### Step 2: Gather Requirements

Ask in small batches, and stop asking when answers are clear from the request or code:

1. What data must be stored? List the entities.
2. How do they relate (1:1, 1:N, M:N), and who owns what?
3. What are the access patterns: the main reads, writes and their filters and sort order?
4. Expected scale: rows, growth, reads and writes per second.
5. Consistency needs: which writes must be atomic together?
6. Is data per tenant (organization, workspace)? Does it include personal or sensitive data, and how long is it kept?

Confirm: "Entities: [list]. Did I miss any?" If no entity can be identified, stop and ask.

Done when the entity list, relationships and top access patterns are confirmed.

### Step 3: Confirm the Database

- If `tech-stack.md`, `decisions.md` or the code already names the primary database, use it. `backend-architect` decisions take precedence. Do not propose a switch mid-feature; raise concerns as a question.
- Only if nothing is recorded, choose with `references/database-selection.md` and record the choice in `decisions.md`.
- Add Redis or a search engine only as derived stores next to the primary.

### Step 4: Design the Schema

For each table or collection define: name, columns with types and nullability, primary key, candidate and business keys, foreign keys with `ON DELETE` behavior, `UNIQUE` and `CHECK` constraints, and indexes tied to a query from Step 2.

Apply these rules (details in `references/relational-rules.md`):

- Match the conventions found in Step 1.
- One PK strategy per project, recorded in `decisions.md`.
- `NOT NULL` by default; timestamps in UTC (`timestamptz` in PostgreSQL); a real mechanism for `updated_at`.
- Case-insensitive, normalized uniqueness for emails, usernames and slugs.
- Index FK columns in PostgreSQL; choose `ON DELETE` deliberately.
- One soft-delete mechanism, with uniqueness that ignores deleted rows.
- Money as integer minor units or fixed-point decimal plus currency; never float.
- Classify personal and sensitive columns and set retention.
- Identity, credentials and roles: defer to `backend-auth` and include the tables it asks for. Do not design a single role column here.
- Multi-tenant data: follow `references/multi-tenancy.md` and record the tenancy model in `decisions.md`.

Use `references/schema-templates.md` for the canonical PostgreSQL, MySQL and MongoDB examples and the ORM schema mapping. Use `references/domain-patterns.md` when the feature is a common domain (users, content, e-commerce, messaging, audit).

Output: target DDL (or ORM schema, or collection validators) for every new or changed table.

### Step 5: Review Normalization, Indexes and Transactions

1. Normalization: every column atomic; no partial or transitive dependencies; M:N resolved with junction tables; derived data stored only with a measured reason and a correctness mechanism.
2. Indexes: each index names the query it serves; composite order is equality first, then range or sort; no duplicate of a unique constraint; no speculative indexes.
3. Critical write flows: transaction boundary, side effects after commit (outbox, owned by `backend-ops`), concurrency strategy (unique constraint, version column, row lock or idempotency key).

Fill the tables in `references/review-templates.md`.

### Step 6: Draft the ERD

Draft a Mermaid `erDiagram` with PK, FK and UK markers and every relationship, per `references/erd.md`. Hand it to `backend-visualize` for rendering conventions and saving if the user wants a rendered or stored diagram.

### Step 7: Write the Migration Plan

Produce a plan, not migration files. One row per schema change:

| # | Change | Kind | Data movement | Depends on | Rollback intent |
|---|--------|------|---------------|------------|-----------------|
| 1 | Create `users` | additive | none | - | drop table (empty) |
| 2 | Create `posts` with FK to `users`, index `user_id` | additive | none | 1 | drop table (empty) |
| 3 | Add `users.locale` NOT NULL default `'en'` | existing table, constant default | none | - | drop column |
| 4 | Rename `users.name` to `full_name` | existing table, expand/contract | dual-write + batched backfill | - | per phase |

- **Kind**: `additive` (new tables, nullable columns, indexes on new tables) or `existing table` changes. Mark anything that rewrites, renames, retypes or drops existing columns, or sets `NOT NULL` on an existing column, as expand/contract. A new `NOT NULL` column with a constant default is not expand/contract, but `backend-migrate` still checks it for locks.
- **Data movement**: backfills or transforms; note the PK type so migrate can batch by key.
- **Depends on**: parents before children; expand before the code switch; contract in a later release.
- **Rollback intent**: how each change is reversed, or why it cannot be (drops lose data).
- Also note: the migration tool and naming convention found in Step 1, raw-SQL steps the ORM cannot express (partial indexes, triggers, RLS), and whether target tables are large or hot.

`backend-migrate` writes the files with the project's tool, applies its lock-safe and expand/contract rules (dual-write, safe `NOT NULL`, `lock_timeout`, `CONCURRENTLY`), and applies migrations only after Always Ask First (`<shared>/tool-rules.md`).

### Step 8: Confirm with the User

Present, in this order:

1. Entity list and ERD.
2. Target schema, with key indexes and constraints highlighted.
3. Decisions: database, PK strategy, tenancy model, soft delete and retention, denormalization exceptions.
4. Normalization and index review, and transaction boundaries for critical flows.
5. The migration plan.

Ask: "Does this schema meet your needs? Any missing fields, relationships or access patterns?" Iterate until the user approves. In `mode=auto`, pause only for missing critical inputs or conflicting decisions (`<shared>/tool-rules.md` -> mode=auto Contract).

### Step 9: Save and Hand Off

On approval, save without a further prompt (memory updates are part of this skill's stated output):

1. Append to `db-schema.md` an entry `## [YYYY-MM-DD HH:MM] Planned: <feature> (not yet applied)` with tables, relationships, indexes and invariants. `backend-migrate` marks it applied.
2. Append to `decisions.md` each new decision: database choice, PK strategy, tenancy model, retention policy, denormalization exceptions.
3. Close the checkpoint.
4. Hand off:
   - `backend-migrate`: target schema and migration plan (always).
   - `backend-visualize`: the ERD, if a rendered diagram is wanted.
   - `backend-api-design`: next step in a feature workflow; pass the concurrency columns that need ETag or 409 handling.
   - `backend-test`: cross-tenant and constraint tests, when relevant.

In `mode=interactive`, show each memory diff and wait for approval before writing it.

## Outputs

- Target schema (DDL, ORM schema or collection validators) for every new or changed table.
- ERD draft (Mermaid).
- Normalization, index and transaction review.
- Migration plan table for `backend-migrate`.
- Memory: a planned-schema entry in `db-schema.md` and new entries in `decisions.md`.

## Done When

- Every confirmed entity has a table or collection with keys, constraints and justified indexes.
- Every FK has an explicit `ON DELETE` choice; every index names its query.
- The migration plan covers every change, with order, kind and rollback intent.
- The user approved the design (or `mode=auto` had no blocking question).
- `db-schema.md` and `decisions.md` are updated, the checkpoint is closed, and the handoff to `backend-migrate` is stated.

## Edge Cases

- **No clear data model**: ask for example records or screens; start with the core entities.
- **Existing schema conflicts with the request**: show the conflict; extend the existing model rather than creating a parallel table.
- **Recorded database does not fit the need**: keep it, and add a derived store or ask the user; never switch silently.
- **Loop-back from implement or auth**: design only the missing tables, then hand a delta plan to `backend-migrate`.
- **Cross-table business rule**: local invariants in DB constraints; cross-aggregate rules in application transactions.
- **Large or hot existing tables**: flag them in the plan so `backend-migrate` uses expand/contract and lock-safe steps.

## References

- `references/database-selection.md`: read when no primary database is recorded, or the user asks which database to use.
- `references/relational-rules.md`: read in Step 4 for keys, columns, case and Unicode, FKs, soft delete, money, concurrency columns, sensitive data, audit and outbox tables.
- `references/schema-templates.md`: read when writing the target schema; canonical PostgreSQL, MySQL and MongoDB examples and the ORM mapping.
- `references/multi-tenancy.md`: read when data belongs to tenants (SaaS, organizations, workspaces).
- `references/domain-patterns.md`: read when the feature is users, content, e-commerce, messaging, audit or another common domain.
- `references/review-templates.md`: read in Steps 5 and 8 for the normalization, index, key and transaction tables.
- `references/erd.md`: read in Step 6 for ERD rules and the template.
