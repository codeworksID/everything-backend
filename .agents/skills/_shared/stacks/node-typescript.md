# Stack Reference: Node.js + TypeScript

Read this when the detected stack is Node.js with TypeScript (Express, Fastify or NestJS; Prisma, Drizzle, TypeORM or Knex). It adds stack-specific detail; it never overrides `tool-rules.md`. Every command that applies migrations, installs packages, or touches a non-local target stays Always Ask First (see `tool-rules.md` -> Always Ask First and Production Targets). For Postgres specifics, also read `postgres.md`.

Prefer the project's own conventions and scripts over this file. Read a script's body before running it (`package.json` `scripts`), since `test` or `build` may run migrations or seeds.

## 1. Detect the Toolchain

| Signal | Meaning |
|---|---|
| `package-lock.json` | npm. Install: `npm ci`. Run: `npx <bin>`, `npm run <script>` |
| `pnpm-lock.yaml` | pnpm. Install: `pnpm install --frozen-lockfile`. Run: `pnpm exec <bin>`, `pnpm <script>` |
| `yarn.lock` + `.yarnrc.yml` | Yarn Berry. Install: `yarn install --immutable`. Run: `yarn <bin>` |
| `yarn.lock` only | Yarn Classic. Install: `yarn install --frozen-lockfile`. Run: `yarn <bin>`, `yarn <script>` |
| `bun.lock` or `bun.lockb` | Bun. Install: `bun install --frozen-lockfile`. Run: `bunx <bin>`, `bun run <script>` |
| `packageManager` in `package.json` | Authoritative when present (Corepack). It overrides lockfile guesses |
| More than one lockfile | Report it as an issue; ask which one is canonical |

Frameworks: `express`, `fastify`, `@nestjs/core` in dependencies. ORMs: `prisma` + `@prisma/client`, `drizzle-orm` + `drizzle-kit`, `typeorm`, `knex`. Module system: `"type": "module"` in `package.json` means ESM; check `tsconfig.json` `module` / `moduleResolution`.

Installing, upgrading or removing packages is Always Ask First, including the install that a missing `node_modules` seems to need.

## 2. Lint, Type-Check, Build (local, run without asking)

- Type-check: `npx tsc --noEmit` (or `-p tsconfig.build.json` if the project has one). Monorepos: `npx tsc -b` uses project references.
- Lint: `npx eslint .` or, if `biome.json` exists, `npx biome check .`. Only use `--fix` / `--write` on files this run created or edited.
- Build: the project's `build` script (`tsc`, `tsup`, `nest build`, `esbuild`, `swc`).
- Swap `npx` for `pnpm exec`, `yarn` or `bunx` per section 1.

## 3. Project Layout

Express or Fastify (feature modules, thin transport layer):

```text
src/
  config/env.ts          # zod-validated env, imported once
  app.ts                 # builds the app; no listen(); used by tests
  server.ts              # listen() + signal handling
  modules/users/
    users.routes.ts      # HTTP: parse, validate, call service, map response
    users.service.ts     # business logic; no req/res objects
    users.repo.ts        # data access (Prisma/Drizzle)
    users.schemas.ts     # zod schemas = DTOs
  lib/errors.ts          # AppError hierarchy
  lib/logger.ts          # pino instance
  instrumentation.ts     # OpenTelemetry, loaded before app code
test/
```

NestJS: one folder per module with `*.module.ts`, `*.controller.ts`, `*.service.ts`, `dto/`, plus `main.ts` for bootstrap. Keep Prisma/Drizzle access in a provider (e.g., `PrismaService`), not in controllers.

Split `app.ts` from `server.ts` so tests can build the app without binding a port.

## 4. Config and Env Validation

Validate env once at startup and fail fast. Never read `process.env` elsewhere.

```ts
import { z } from "zod";

const Env = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  JWT_ISSUER: z.string().min(1),
  JWT_AUDIENCE: z.string().min(1),
  JWKS_URL: z.string().url(),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

const parsed = Env.safeParse(process.env);
if (!parsed.success) {
  // Print key names and issues only; never print values.
  console.error("Invalid environment:", parsed.error.issues.map((i) => i.path.join(".")));
  process.exit(1);
}
export const env = parsed.data;
```

- Zod 3 and Zod 4 differ in some APIs (error formatting, string formats). Check the installed major before using version-specific helpers.
- NestJS: `@nestjs/config` with a `validate` function that runs the zod schema.
- Keep `.env.example` in sync with the schema. Editing `.env*` secret files is Always Ask First.

## 5. Request Validation and DTOs

- Validate every body, query and path param at the boundary. Return 400 (or 422, per `api-patterns.md`) with field-level issues.
- Express: a small `validate(schema)` middleware that runs `schema.safeParse(req.body)` and passes `parsed.data` on. Never spread unvalidated `req.body` into an ORM call (mass assignment).
- Fastify: route `schema` (JSON Schema, compiled by Ajv) or a zod type provider such as `fastify-type-provider-zod`. Set a `response` schema too; it strips fields not in the schema, which prevents leaking columns.
- NestJS: global `ValidationPipe` with `class-validator` DTOs:

```ts
app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
```

- Map ORM entities to response DTOs explicitly. Never return a Prisma model with `passwordHash` or internal fields.
- Set a body size limit (`express.json({ limit: "100kb" })`; Fastify `bodyLimit`).

## 6. Error Handling

One error handler per app. Domain code throws typed errors; the handler maps them to the error envelope in `api-patterns.md`.

```ts
export class AppError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}

// Express: error middleware must have 4 parameters and be registered last.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
  const known = err instanceof AppError;
  if (!known) req.log.error({ err }, "unhandled error");
  res.status(known ? err.status : 500).json({
    error: { code: known ? err.code : "INTERNAL", message: known ? err.message : "Internal error" },
  });
});
```

- Express 4 does not catch rejected promises from async handlers; use a wrapper or upgrade path. Express 5 forwards them to the error middleware.
- Fastify: `app.setErrorHandler((err, req, reply) => ...)`; validation errors arrive with `err.validation`.
- NestJS: a global `ExceptionFilter`; throw `HttpException` subclasses or map domain errors in the filter.
- Map known ORM errors (unique violation -> 409, not found -> 404). Prisma uses codes such as `P2002` (unique) and `P2025` (record not found).
- Never send stack traces or SQL in responses. Log them with the request id.
- Register `process.on("unhandledRejection")` to log and exit; let the orchestrator restart the process.

## 7. Auth Libraries

- JWT verification: use `jose`. Pin algorithms, issuer and audience; never decode without verifying.

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";

const jwks = createRemoteJWKSet(new URL(env.JWKS_URL)); // cached, refetches on unknown kid
export async function verifyAccessToken(token: string) {
  const { payload } = await jwtVerify(token, jwks, {
    algorithms: ["RS256"],          // never accept "none" or a mix of HS*/RS*
    issuer: env.JWT_ISSUER,
    audience: env.JWT_AUDIENCE,
    clockTolerance: 30,             // seconds
  });
  return payload;
}
```

- For HS256 with a shared secret, pass `new TextEncoder().encode(secret)` and `algorithms: ["HS256"]`. The secret comes from env, at least 32 random bytes.
- `jsonwebtoken`: if the project already uses it, always pass `{ algorithms: [...] }` to `verify`.
- Passwords: `argon2` (argon2id) or `bcrypt`. Never `crypto.createHash` for passwords.
- Session/auth frameworks (`passport`, `better-auth`, `lucia`, `@fastify/passport`, NestJS `@nestjs/passport`): maintenance status changes over time. Before adopting one, check its repository for recent releases and any deprecation notice, and record the choice in `decisions.md`. Do not assume a library is current from memory.
- Full rules (refresh rotation, CSRF, tenant-scoped authorization) live in `backend-auth`; follow them.

## 8. ORM Migration Commands and Safety

Only `backend-migrate` applies migrations. "Ask" below means Always Ask First: show the command, the resolved `DATABASE_URL` host (not the password) and the effect. The exception for a disposable database this run started (Testcontainers, temp SQLite) still applies. `guard.js` may prompt for these commands regardless; that is expected.

| Command | Effect | Rule |
|---|---|---|
| `npx prisma generate` | Generates the client from the schema; no DB | Run |
| `npx prisma validate`, `npx prisma format` | Checks/formats `schema.prisma` | Run (format only if this run edits the schema) |
| `npx prisma migrate diff ... --script` | Prints SQL between two states | Run if all sources are files or a local shadow DB; flag names vary by Prisma major, check `--help` |
| `npx prisma migrate dev --create-only` | Writes a migration file; still connects to the dev DB and a shadow DB | Ask unless both are provably local |
| `npx prisma migrate dev` | Creates and applies a migration; may offer to reset the DB on drift | Ask; development DB only, never shared or production |
| `npx prisma migrate deploy` | Applies pending migrations; no reset, no generation | Ask; this is the production/CI command |
| `npx prisma migrate status` | Reads migration state from the DB | Read-only, but resolve the target first |
| `npx prisma migrate resolve` | Marks a migration applied/rolled back | Ask |
| `npx prisma migrate reset` | Drops the DB, reapplies all, runs seed | Ask; never against a non-disposable DB |
| `npx prisma db push` | Syncs schema with no migration file; can drop data (`--accept-data-loss`) | Ask; prototyping only, never production |
| `npx prisma db seed` | Runs the seed script | Ask unless the target is disposable |
| `npx drizzle-kit generate` | Writes SQL migration files from the schema; offline | Run |
| `npx drizzle-kit check` | Checks migration files for consistency | Run |
| `npx drizzle-kit migrate` | Applies generated migrations | Ask |
| `npx drizzle-kit push` | Applies schema diff directly, no files | Ask; prototyping only, never production |
| `npx drizzle-kit pull` | Introspects the DB into schema files | Read-only on DB, writes files; resolve target first |
| TypeORM `migration:generate` / `migration:create` | Writes a migration file (`generate` reads the DB to diff) | Run `create`; `generate` needs a local DB |
| TypeORM `migration:run` / `migration:revert` / `schema:sync` / `schema:drop` | Apply, revert, sync, drop | Ask |
| `npx knex migrate:make <name>` | Writes a migration file | Run |
| `npx knex migrate:latest` / `migrate:rollback` / `migrate:up` / `migrate:down` | Apply or revert | Ask |

TypeORM CLI with TypeScript: `npx typeorm-ts-node-commonjs migration:run -d src/data-source.ts` (or the ESM variant). Never set `synchronize: true` outside throwaway local dev.

Review generated SQL before applying. Prisma and Drizzle generate `DROP COLUMN` + `ADD COLUMN` for some renames; rewrite as expand/contract per `backend-migrate`. Add `CONCURRENTLY` to index creation by hand. It cannot run inside a transaction block: Drizzle and Knex wrap migrations in a transaction by default, and Prisma sends a multi-statement file as one batch (an implicit transaction). Put the statement alone in its own migration file and check the tool's docs for disabling the transaction (Knex: `exports.config = { transaction: false }`).

## 9. Testing

- Runner: Vitest (`npx vitest run`; never plain `vitest` in automation, it starts watch mode) or Jest (`npx jest`). Match the project's runner.
- HTTP tests: Express/NestJS with `supertest` (`request(app).get("/healthz").expect(200)`; NestJS uses `app.getHttpServer()`). Fastify with `app.inject({ method: "GET", url: "/healthz" })` (light-my-request); no port needed.
- NestJS units: `Test.createTestingModule({ ... }).overrideProvider(X).useValue(mock)`.
- Real DB tests: Testcontainers (`@testcontainers/postgresql`). Start the container in global setup, pass its URI to the app, apply migrations to it (allowed: the run started this DB), stop it in teardown.

```ts
import { PostgreSqlContainer } from "@testcontainers/postgresql";
const pg = await new PostgreSqlContainer("postgres:16-alpine").start(); // match the production major
process.env.DATABASE_URL = pg.getConnectionUri();
```

- Isolation, pick one: wrap each test in a transaction and roll back; one database or schema per worker (`VITEST_POOL_ID` / `JEST_WORKER_ID`); or truncate tables between tests. Run DB suites serially if they share one database (`jest --runInBand`, Vitest `--no-file-parallelism`).
- Before running, read `vitest.config.*` / `jest.config.*` and any `globalSetup`: if it uses a `DATABASE_URL` from `.env`, resolve that target per Production Targets.
- Never mock the ORM to make an integration test pass; never weaken assertions (see Test Integrity).

## 10. Logging (pino)

- One `pino` instance; JSON to stdout in production. `pino-pretty` only in local dev, never in the production image.
- Express: `pino-http` (adds `req.log` and a request id). Fastify: built in (`Fastify({ logger: { level: env.LOG_LEVEL } })`, use `request.log`). NestJS: `nestjs-pino`.
- Redact secrets: `redact: ["req.headers.authorization", "req.headers.cookie", "*.password", "*.token"]`.
- Log errors as `log.error({ err }, "msg")` so the serializer keeps the stack. Never `console.log` in request paths.
- Propagate a request id (accept `x-request-id` if trusted, else generate) and include it in error responses.

## 11. OpenTelemetry

- Packages: `@opentelemetry/sdk-node`, `@opentelemetry/auto-instrumentations-node`, and an OTLP exporter (`@opentelemetry/exporter-trace-otlp-http` or `-proto`). Adding them is a dependency install: ask first.
- Start the SDK before any other import. CommonJS: `node --require ./dist/instrumentation.js dist/server.js`. ESM needs the module hook as well; follow the current OpenTelemetry JS docs for ESM (`--import` plus the register hook).
- Configure with standard env vars: `OTEL_SERVICE_NAME`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_RESOURCE_ATTRIBUTES`, `OTEL_TRACES_SAMPLER`.
- Correlate logs and traces: `@opentelemetry/instrumentation-pino` injects `trace_id` / `span_id`.
- Disable noisy instrumentations (e.g., `fs`) in the auto-instrumentation config.
- Call `sdk.shutdown()` during graceful shutdown so spans flush.

## 12. Graceful Shutdown

```ts
let shuttingDown = false;
async function shutdown(signal: string) {
  if (shuttingDown) return;
  shuttingDown = true;                       // /readyz starts returning 503
  logger.info({ signal }, "shutting down");
  const timer = setTimeout(() => process.exit(1), 25_000).unref(); // below terminationGracePeriod
  await new Promise<void>((r) => server.close(() => r())); // Fastify: await app.close()
  await prisma.$disconnect();                // or pool.end(), redis.quit(), queue.close()
  await otelSdk?.shutdown();
  clearTimeout(timer);
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));
```

- NestJS: `app.enableShutdownHooks()` and implement `OnApplicationShutdown` / `onModuleDestroy`.
- Run Node as the container's main process with exec-form `CMD ["node", ...]`. `npm start` as PID 1 may not forward signals; use `docker run --init` or `tini` if a wrapper is needed.
- Keep-alive connections can hold `server.close()` open; on Node 18.2+ call `server.closeIdleConnections()` after `close()`.

## 13. Health and Readiness

- `GET /healthz` (liveness): returns 200 if the process is running. No dependency checks, or a stuck DB triggers restart loops.
- `GET /readyz` (readiness): 503 while shutting down; checks the DB (`SELECT 1`, e.g. ``prisma.$queryRaw`SELECT 1` ``) and other hard dependencies with a short timeout (1-2 s).
- NestJS: `@nestjs/terminus` provides health indicators.
- Exclude both from auth, rate limits and request logging noise; never expose versions of dependencies or config in the body.

## 14. Dockerfile

```dockerfile
# Set NODE_VERSION to the current Active LTS major (nodejs.org release schedule).
# Pin the image digest for production builds.
ARG NODE_VERSION=lts
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npx prisma generate   # only if Prisma is used
RUN npm run build

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=node:node /app/dist ./dist
# Prisma: also copy the generated client and the schema/engine it needs; see Prisma's Docker guide.
USER node
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- Replace the npm lines for pnpm/yarn/bun per section 1 (e.g., `corepack enable` then `pnpm install --frozen-lockfile --prod`).
- Add a `.dockerignore` with `node_modules`, `.env*`, `.git`, `dist`, coverage and test output.
- Never `COPY .env` or bake secrets via `ARG`/`ENV`; inject at runtime.
- `-alpine` images use musl; native modules (argon2, bcrypt, Prisma engines) need matching builds. Prefer `-slim` unless the project already uses Alpine.
- Migrations run as a separate, gated pipeline step (`prisma migrate deploy` / `drizzle-kit migrate` in a release job), not in the container `CMD`. See `backend-deploy`.
- Building and pushing images is the user's call: `docker build` locally runs without asking; `docker push` is Always Ask First.

## 15. Data Access Safety

Injection-proof data access is mandatory. The rules, the safe/unsafe API table for pg, mysql2, Prisma, Drizzle, Knex, Sequelize and TypeORM, and the required verification are in `_shared/sql-safety.md`; this section only shows the Node forms. The owner (`ctx.tenantId`, `ctx.userId`) always comes from the verified token or session, never from `req.body`, `req.params` or `req.query`.

```ts
// users.schemas.ts: validation is defense in depth, not the fix
export const ListOrdersQuery = z.object({
  sort: z.enum(["created", "total"]).default("created"),
  dir: z.enum(["asc", "desc"]).default("desc"),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

// orders.repo.ts
const SORT_FIELD = { created: "createdAt", total: "totalCents" } as const; // server-side allowlist

export function getOrder(ctx: AuthCtx, id: string) {
  return prisma.order.findFirst({ where: { id, tenantId: ctx.tenantId } }); // null -> 404
}

export async function setOrderStatus(ctx: AuthCtx, id: string, status: OrderStatus) {
  const { count } = await prisma.order.updateMany({
    where: { id, tenantId: ctx.tenantId },          // key + owner: bounded write
    data: { status },                               // explicit fields, never ...req.body
  });
  if (count === 0) throw new AppError(404, "NOT_FOUND", "Order not found");
}

export function listOrders(ctx: AuthCtx, q: z.infer<typeof ListOrdersQuery>) {
  return prisma.order.findMany({
    where: { tenantId: ctx.tenantId },
    orderBy: { [SORT_FIELD[q.sort]]: q.dir },       // never orderBy: req.query.sort
    take: q.limit,
  });
}
```

Raw SQL, when the query builder cannot express it:

```ts
// Prisma: every ${} in $queryRaw is a bound parameter; identifiers are constant Prisma.sql fragments.
const ORDER_BY = { created: Prisma.sql`created_at`, total: Prisma.sql`total_cents` } as const;
const DIR = { asc: Prisma.sql`ASC`, desc: Prisma.sql`DESC` } as const;
if (ids.length === 0 || ids.length > 100) throw new AppError(400, "BAD_IDS", "1-100 ids");
const rows = await prisma.$queryRaw<OrderRow[]>`
  SELECT id, status FROM orders
  WHERE tenant_id = ${ctx.tenantId} AND id IN (${Prisma.join(ids)})
  ORDER BY ${ORDER_BY[q.sort]} ${DIR[q.dir]}
  LIMIT ${q.limit}`;

// node-postgres: placeholders + values array; lists as one array parameter
await pool.query(
  "SELECT id, status FROM orders WHERE tenant_id = $1 AND id = ANY($2::bigint[])",
  [ctx.tenantId, ids],
);

// LIKE search: escape \ % _ in the term, then bind the pattern (Postgres and MySQL default escape is \)
const escapeLike = (s: string) => s.replace(/[\\%_]/g, (c) => "\\" + c);
const term = q.search ?? "";
db.select().from(customers).where(and(
  eq(customers.tenantId, ctx.tenantId),
  ilike(customers.name, `%${escapeLike(term)}%`),   // Drizzle binds the pattern as a parameter
));

// Knex: column from the allowlist, values bound
const SORT_COLUMN = { created: "created_at", total: "total_cents" } as const;
knex("orders").where({ tenant_id: ctx.tenantId }).orderBy(SORT_COLUMN[q.sort], q.dir).limit(q.limit);
```

- mysql2: prefer `execute` (server-side prepared) and keep `multipleStatements` unset (default `false`).
- MongoDB/Mongoose: `mongoose.set("sanitizeFilter", true)` and `mongoose.set("strictQuery", true)`; validate scalars with zod (`z.string()`) so `{"$ne": null}` is rejected with 400; never `$where` or `$function` with input.
- Map ORM and driver errors (Prisma `P2002`, `P2025`, pg error codes) to `AppError`; never return the driver message.
- Before reporting done, run `_shared/sql-safety.md` -> Verification (static search, read every changed `*.repo.ts`, semgrep, negative tests with hostile payloads in supertest or `app.inject`).

## 16. Common Anti-Patterns

- `process.env.X` scattered through the code instead of one validated `env` module.
- `prisma db push` or `drizzle-kit push` used as the production migration path; TypeORM `synchronize: true` in any shared environment.
- `new PrismaClient()` per request (exhausts connections); create one per process.
- Async Express 4 handlers without error forwarding (hung requests, unhandled rejections).
- `jwt.decode` / `jose.decodeJwt` used as if it verified the token; `verify` without `algorithms`.
- Returning ORM entities directly (leaks hashes, internal flags); spreading `req.body` into `create`/`update`.
- N+1 queries from lazy loops; use `include`/`with`, joins or batching (DataLoader).
- SQL built from strings: template literals or `+` into `pool.query`, `knex.raw`, `whereRaw`, `orderByRaw`, `sequelize.query` or TypeORM `.where()`; `$queryRawUnsafe`, `$executeRawUnsafe`, `Prisma.raw(input)`, `sql.raw(input)` or `sequelize.literal(input)` with user input. Use tagged templates and bound parameters (section 15, `_shared/sql-safety.md`).
- `orderBy` / column names taken straight from `req.query`; map them through a server-side allowlist.
- Lookups by id alone (`findUnique({ where: { id } })`, `update({ where: { id } })`) on tenant- or user-owned rows; add the owner from the authenticated principal (BOLA).
- Blocking the event loop: sync `fs`/`crypto` in handlers, large `JSON.parse` on hot paths, CPU work without a worker thread.
- No timeout on outbound HTTP (`fetch` with `AbortSignal.timeout(ms)`), DB pool or queue calls.
- `console.log` logging, logging tokens or full request bodies.
- `npm install` in CI or Docker instead of `npm ci`; dev dependencies in the runtime image; running as root.
- Floating promises (no `await`, no `.catch`); enable `@typescript-eslint/no-floating-promises`.
- `any` at boundaries, `// @ts-ignore` to silence real type errors, `strict: false` in `tsconfig.json`.
- Tests that share a database across parallel workers without isolation, or that point at a `.env` database that is not provably local.
