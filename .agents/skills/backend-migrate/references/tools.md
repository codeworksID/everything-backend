# Migration Tools

## Detect the Tool and Directory

Detect the tool from manifests and config first, then find the directory. Search recursively (monorepos nest these).

| Signal | Tool | Usual migrations path |
|--------|------|-----------------------|
| `prisma/schema.prisma` | Prisma | `prisma/migrations/` |
| `alembic.ini`, `env.py` | Alembic | `alembic/versions/` or `migrations/versions/` |
| `manage.py` | Django | `<app>/migrations/` in each app |
| `Gemfile` with `rails`, `db/migrate/` | Rails | `db/migrate/` |
| `flyway.conf`, `flyway.toml` | Flyway | `src/main/resources/db/migration/` or `sql/` |
| `liquibase.properties`, `changelog*.xml/yaml` | Liquibase | `src/main/resources/db/changelog/` |
| `*.csproj` with `Microsoft.EntityFrameworkCore.Design` | EF Core | `Migrations/` |
| `ormconfig.*`, `data-source.ts` | TypeORM | configured `migrations` glob, often `src/migrations/` |
| `.sequelizerc` | Sequelize | `migrations/` |
| `knexfile.*` | Knex | `migrations/` |
| `drizzle.config.*` | Drizzle | configured `out` folder, often `drizzle/` |
| `*.up.sql` / `*.down.sql` pairs | golang-migrate | configured `-path` |
| `-- +goose Up` in SQL files | goose | configured dir |
| `artisan` | Laravel | `database/migrations/` |
| `supabase/config.toml` | Supabase CLI | `supabase/migrations/` |

If nothing matches, ask the user which tool generates and applies migrations and where the files live. Do not guess. If the project has no migrations yet, the first migration still comes here; use the target schema backend-db-design handed over.

## Generate, Review, Apply

Always generate first, review the generated SQL for `DROP`, type changes and table rewrites, then apply (Always Ask First unless the target is a disposable database). Many tools turn a rename into drop + add, which deletes the column's data; hand-edit those into the expand/contract sequence.

| Tool | Generate | Renames | Never on shared DBs without Ask First |
|------|----------|---------|----------------------------------------|
| Prisma | `prisma migrate dev --create-only` (writes SQL, does not apply) only against a provably local, disposable DB: it connects, checks drift and can offer a reset. Otherwise generate SQL with `prisma migrate diff` (migrations directory to schema, `--script`, local shadow DB; flag names changed across major versions, so check `--help`) and save it as a new `migration.sql`. Apply with `prisma migrate deploy` | Field rename is generated as drop + add; keep the DB name with `@map`/`@@map` or hand-edit the SQL | `prisma migrate reset`; `prisma migrate dev` against anything but a disposable local DB; `prisma db push` (especially `--accept-data-loss`) |
| Alembic | `alembic revision --autogenerate -m "..."`; apply `alembic upgrade head` | Autogenerate does not detect renames (emits drop + add); hand-edit | `alembic downgrade` on shared DBs |
| Django | `python manage.py makemigrations`; inspect with `sqlmigrate`; apply `migrate` | Asks "Did you rename...?" only interactively for simple renames; with `--noinput` or combined changes it emits RemoveField + AddField; `db_column` keeps the DB name | `python manage.py flush`; `migrate <app> zero` |
| Rails | `bin/rails generate migration ...` (hand-written); apply `bin/rails db:migrate` | No autodetect; `rename_column` is instant but breaks running code, so use expand/contract and `ignored_columns` before dropping | `db:reset`, `db:drop`, `db:schema:load`, `db:migrate:reset` |
| Flyway / Liquibase | Hand-written versioned SQL or changesets (`liquibase diff-changelog` can generate) | No autodetect; diff tools emit drop + add | `flyway clean`; `liquibase drop-all`; `liquibase rollback` |
| golang-migrate | `migrate create -ext sql -dir <dir> -seq <name>` (hand-written up/down) | No autodetect | `migrate drop`; `migrate down` without a count; `migrate force` (changes the version without running SQL) |
| goose | `goose create <name> sql`; apply `goose up` | No autodetect | `goose down` / `goose reset` on shared DBs |
| TypeORM / Sequelize / Knex | `typeorm migration:generate`; `sequelize-cli migration:generate` (empty skeleton); `knex migrate:make` (skeleton) | TypeORM generates drop + add; Sequelize and Knex are hand-written | `synchronize: true`, `sequelize.sync({ force: true })` or `sync({ alter: true })` outside local dev; `typeorm schema:drop`; `db:migrate:undo:all`; `knex migrate:rollback --all` |
| Drizzle | `drizzle-kit generate` (writes SQL; asks interactively whether a change is a rename); apply `drizzle-kit migrate` | Answer the rename prompt or hand-edit; review the SQL | `drizzle-kit push` (applies schema directly, no migration file) |
| EF Core | `dotnet ef migrations add <Name>`; review with `dotnet ef migrations script` | Property rename is scaffolded as drop + add (with a data-loss warning); change it to `RenameColumn` or expand/contract | `dotnet ef database drop`; `dotnet ef database update 0`; `EnsureDeleted()` |

Generators that connect to the database (Prisma `migrate dev --create-only`, Alembic `--autogenerate`, TypeORM `migration:generate`) run without asking only when the configured database is provably local (`<shared>/tool-rules.md` -> Production Targets). Otherwise show the resolved target and ask first, or point the generator at a local or disposable database.

## Migration Role

Migrations and backfill jobs run with a dedicated migration role, not the application role (`<shared>/sql-safety.md` rule 11). The application role keeps only the DML it needs, so an injection in the app cannot run DDL.

- The migration role owns the schema objects and may run DDL. It is not `SUPERUSER` and has no `BYPASSRLS` unless a specific migration needs it, and then only for that run. Its credentials live in the deploy pipeline's secret store, not in the app's runtime environment.
- The application role gets `SELECT, INSERT, UPDATE, DELETE` (and sequence `USAGE`) on its own schema, nothing more. Grant it through default privileges so new tables are covered without granting DDL:

```sql
-- run once by the migration role (Always Ask First on a non-local database)
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_rw;
ALTER DEFAULT PRIVILEGES FOR ROLE app_migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO app_rw;
REVOKE CREATE ON SCHEMA app FROM PUBLIC;
```

- Point the tool at the migration role through its own connection setting (for example a separate `MIGRATION_DATABASE_URL`, Prisma `directUrl`, the URL in `alembic.ini` or `flyway.conf`). If the project runs migrations with the app's connection string, flag it and propose the split; changing roles or grants on a shared database is Always Ask First.
- Never run migrations automatically at app startup with the app role: that forces the app role to hold DDL.

## Running Outside a Transaction

Needed for `CREATE INDEX CONCURRENTLY` and friends on PostgreSQL. Use the tool's per-migration opt-out:

- Rails: `disable_ddl_transaction!` (with `algorithm: :concurrently`)
- Django: `atomic = False` on the `Migration` class, or `AddIndexConcurrently` from `django.contrib.postgres.operations`
- Alembic: `with op.get_context().autocommit_block():`
- Liquibase: `runInTransaction="false"` on the changeSet
- Flyway: a script config file next to the migration with `executeInTransaction=false`
- Knex: `exports.config = { transaction: false }` in the migration
- goose: `-- +goose NO TRANSACTION` at the top of the file
- EF Core: `migrationBuilder.Sql(..., suppressTransaction: true)`
- Others (Prisma, TypeORM, Drizzle, golang-migrate, sqlx, Atlas): confirm the opt-out or default behavior in the tool's docs for the version in use. Keep one statement per file either way.

Never fix a "cannot run inside a transaction block" error by removing `CONCURRENTLY`.

## Parallel Branches

If two branches add migrations in parallel, regenerate or reorder before merge so version numbers and dependencies stay linear: Alembic multiple heads (`alembic merge` or re-parent), Django conflicting leaf nodes (`makemigrations --merge`, then review), Prisma and Flyway out-of-order versions (rename to a later version; never edit an already-applied migration).

## Linting and Drift Checks

Use what the project already has; suggest adding one if none exists (installing is Always Ask First):

- SQL on PostgreSQL: `squawk` lints migration files for locking and rewrite risks.
- Rails: `strong_migrations`. Django: `django-migration-linter`. Atlas: `atlas migrate lint`.
- Drift between models and migrations: `python manage.py makemigrations --check --dry-run`, `alembic check`, `prisma migrate diff` (exit code mode), `dotnet ef migrations has-pending-model-changes` where supported.
