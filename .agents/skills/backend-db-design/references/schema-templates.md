# Schema Templates

Read this when writing the target schema in Step 4. There is one canonical example per store. Adapt names, types and keys to the project's conventions and its recorded PK strategy (`relational-rules.md` -> Primary Keys).

These are target-schema sketches for the design, not migration files. `backend-migrate` turns them into migrations with the project's tool. Plain `CREATE INDEX` is fine for a table created in the same migration; indexes on existing tables need migrate's lock-safe rules (`CONCURRENTLY` and friends).

Identity, credentials and roles are owned by `backend-auth`. The `users` table below holds only core profile columns: `password_hash` is nullable so social-login-only users fit, and roles live in a `user_roles` junction table designed with `backend-auth`, not a single role column.

## PostgreSQL

```sql
CREATE TABLE users (
    id               uuid PRIMARY KEY DEFAULT gen_random_uuid(), -- or uuidv7() on PG 18+, or an app-generated UUIDv7
    email            text NOT NULL,
    email_normalized text NOT NULL,             -- NFKC + case-folded in the app
    password_hash    text NULL,                 -- owned by backend-auth; NULL for social-only accounts
    status           text NOT NULL DEFAULT 'active'
                     CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended')),
    created_at       timestamptz NOT NULL DEFAULT now(),
    updated_at       timestamptz NOT NULL DEFAULT now(),
    deleted_at       timestamptz NULL           -- the only deletion marker
);

-- Case-insensitive uniqueness among live rows (the unique index is the lookup index too)
CREATE UNIQUE INDEX users_email_normalized_key
    ON users (email_normalized) WHERE deleted_at IS NULL;

CREATE TABLE categories (
    id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    slug text NOT NULL CONSTRAINT categories_slug_key UNIQUE
);

CREATE TABLE posts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      uuid NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
    category_id  uuid NULL REFERENCES categories (id) ON DELETE SET NULL,
    title        text NOT NULL,
    slug         text NOT NULL CONSTRAINT posts_slug_key UNIQUE,
    body         text NOT NULL,
    status       text NOT NULL DEFAULT 'draft'
                 CONSTRAINT posts_status_check CHECK (status IN ('draft', 'published', 'archived')),
    published_at timestamptz NULL,
    version      integer NOT NULL DEFAULT 0,    -- optimistic locking
    created_at   timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- PostgreSQL does not index FK columns for you
CREATE INDEX posts_user_id_idx ON posts (user_id);
CREATE INDEX posts_category_id_idx ON posts (category_id);
-- Only for a real query: "published posts, newest first"
CREATE INDEX posts_status_published_at_idx ON posts (status, published_at DESC);

-- Keep updated_at honest (or set it in one ORM hook, not both)
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_set_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER posts_set_updated_at BEFORE UPDATE ON posts
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

## MySQL 8 (InnoDB)

Differences from PostgreSQL: no partial indexes (use a generated column), UUIDs as `BINARY(16)`, `DATETIME(6)` in UTC, explicit charset and collation.

```sql
CREATE TABLE users (
    id               BINARY(16) NOT NULL PRIMARY KEY,   -- UUIDv7 from the app; or BIGINT AUTO_INCREMENT
    email            VARCHAR(320) NOT NULL,
    email_normalized VARCHAR(320) NOT NULL,
    password_hash    VARCHAR(255) NULL,
    status           VARCHAR(16) NOT NULL DEFAULT 'active',
    created_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at       DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    deleted_at       DATETIME(6) NULL,
    -- NULL for deleted rows, so the unique key ignores them
    email_live       VARCHAR(320) AS (IF(deleted_at IS NULL, email_normalized, NULL)) STORED,
    CONSTRAINT users_status_check CHECK (status IN ('active', 'suspended')),  -- enforced from 8.0.16
    UNIQUE KEY users_email_live_key (email_live)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE posts (
    id         BINARY(16) NOT NULL PRIMARY KEY,
    user_id    BINARY(16) NOT NULL,
    title      VARCHAR(200) NOT NULL,
    status     VARCHAR(16) NOT NULL DEFAULT 'draft',
    version    INT NOT NULL DEFAULT 0,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
    CONSTRAINT posts_user_id_fk FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE RESTRICT,
    KEY posts_status_created_at_idx (status, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
```

Set the connection `time_zone = '+00:00'` so `DATETIME` values are written in UTC.

## MongoDB

Use a `$jsonSchema` validator so documents cannot drift, and design indexes for the real queries. Shell syntax (`mongosh`); translate to the project's ODM.

```javascript
db.createCollection("users", {
  validator: {
    $jsonSchema: {
      bsonType: "object",
      required: ["email", "status", "createdAt", "updatedAt"],
      properties: {
        email:           { bsonType: "string" },
        emailNormalized: { bsonType: "string" },        // removed on soft delete
        passwordHash:    { bsonType: ["string", "null"] },
        status:          { enum: ["active", "suspended"] },
        createdAt:       { bsonType: "date" },
        updatedAt:       { bsonType: "date" },
        deletedAt:       { bsonType: "date" }            // absent until deleted
      }
    }
  },
  validationLevel: "strict"
});

// Unique only for live users: soft delete sets deletedAt and unsets emailNormalized
db.users.createIndex(
  { emailNormalized: 1 },
  { unique: true, partialFilterExpression: { emailNormalized: { $type: "string" } } }
);
db.users.createIndex({ status: 1, createdAt: -1 });
// Only if you query deleted documents, e.g. a purge job
db.users.createIndex({ deletedAt: 1 }, { partialFilterExpression: { deletedAt: { $exists: true } } });
```

Notes:
- `sparse: true` does not skip documents where the field is present with value `null`; leave the field absent, or use `partialFilterExpression`.
- For case-insensitive matching without a normalized field, use an index with a collation (`{ locale: "en", strength: 2 }`) and query with the same collation.
- Embed data owned by and read with the parent (order lines in an order). Reference data shared across parents or growing without bound (comments on a popular post).

## ORM Schema Output

When the project uses an ORM, express the design in its schema language as well, so `backend-migrate` can generate migrations from it. Read the existing schema first and match its style.

| ORM / tool | Where the schema lives | Notes |
|---|---|---|
| Prisma | `schema.prisma` | `@unique`, `@@index`, `@relation(onDelete: ...)`; partial indexes need raw SQL in the migration |
| Drizzle | `schema.ts` (or the configured path) | `uniqueIndex().on(...).where(sql\`...\`)` supports partial indexes |
| TypeORM / MikroORM | entity classes | Declare FK indexes explicitly |
| SQLAlchemy (+ Alembic) | model classes | `Index(..., postgresql_where=...)` for partial indexes |
| Django | `models.py` | `UniqueConstraint(..., condition=Q(deleted_at__isnull=True))` |
| Rails ActiveRecord | migrations and `db/schema.rb` | `add_index ..., unique: true, where: "deleted_at IS NULL"` |
| GORM | struct tags | Prefer explicit migration files for constraints the tags cannot express |
| JPA / Hibernate | entity classes | Use Flyway or Liquibase for real DDL; do not rely on `ddl-auto` |
| Entity Framework Core | `DbContext` model config | `HasIndex(...).IsUnique().HasFilter(...)` |
| Mongoose | schema definitions | Add the validator in the collection too; Mongoose validation alone is bypassed by other writers |

If a feature (partial index, trigger, RLS policy) cannot be expressed in the ORM, list it in the migration plan as a raw-SQL step.
