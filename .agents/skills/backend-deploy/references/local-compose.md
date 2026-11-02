# Local Compose and .env.example

Compose is for local development and small single-host deployments. For production on a VM, see `platforms.md`.

## compose.yaml

Use `compose.yaml` for new projects; keep `docker-compose.yml` if the project already has it. The top-level `version:` key is obsolete; leave it out.

```yaml
services:
  app:
    build: .
    ports: ["3000:3000"]          # the app's real port
    env_file: .env                # app settings only; never shared with db or cache
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
      REDIS_URL: redis://cache:6379
    depends_on:
      db:
        condition: service_healthy
      cache:
        condition: service_healthy
    healthcheck:                  # needs curl or wget in the image; drop for distroless
      test: ["CMD-SHELL", "wget -qO- http://localhost:3000/readyz || exit 1"]
      interval: 10s
      timeout: 3s
      retries: 5
      start_period: 20s

  migrate:                        # one-off; mirrors the pipeline's migration job
    build:
      context: .
      target: build               # a stage that has the migration tool installed
    command: ["npx", "prisma", "migrate", "deploy"]   # the project's real migrate command
    environment:
      DATABASE_URL: postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
    depends_on:
      db:
        condition: service_healthy
    profiles: ["migrate"]

  db:
    image: postgres:<major>-alpine   # same major as production
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    volumes:
      - postgres_data:/var/lib/postgresql   # postgres:18+ images; for 17 and older mount /var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U $${POSTGRES_USER} -d $${POSTGRES_DB}"]
      interval: 5s
      timeout: 5s
      retries: 10

  cache:
    image: redis:<major>-alpine
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 10

volumes:
  postgres_data:
```

Notes:

- Inside the compose network, services reach each other by service name (`db`, `cache`), never `localhost`.
- `${VAR}` is filled from the shell or from a `.env` file next to `compose.yaml`. `$$` escapes `$` so the healthcheck reads the variable inside the container.
- Only the app gets `env_file`. The database gets only the `POSTGRES_*` values it needs, so it never sees app secrets such as JWT keys.
- The `migrate` service runs only on request: `docker compose --profile migrate run --rm migrate`. It applies migrations to the local container database, which is provably local only when this compose project started it. Applying migrations from an agent session still follows backend-migrate's rules.
- Put local-only settings (bind mounts for hot reload, debug ports, dev commands) in `compose.override.yaml`, which compose merges automatically. Keep the base file close to production.
- Match the database major version to production. The official `postgres` image changed its data layout in 18: mount the volume at `/var/lib/postgresql` for 18+ (the 18+ entrypoint refuses to start with a volume at `/var/lib/postgresql/data`), and at `/var/lib/postgresql/data` for 17 and older.

## Running Locally

```bash
docker compose config -q             # validate the merged file
docker compose up -d --wait          # start and wait for healthchecks
curl -fsS http://localhost:3000/readyz
docker compose down                  # stop; keeps volumes
```

`docker compose down -v` deletes the database volume. It is Always Ask First.

## .env.example

Commit `.env.example`; never commit `.env`. Creating or editing any `.env*` file is Always Ask First.

```text
# App
NODE_ENV=development
PORT=3000
LOG_LEVEL=info

# Database (local compose values; production values come from the secret store)
POSTGRES_USER=app
POSTGRES_PASSWORD=
POSTGRES_DB=app
DATABASE_URL=

# Cache
REDIS_URL=

# Secrets: leave empty here. Generate locally, e.g. `openssl rand -base64 48`.
JWT_SECRET=
```

- Leave every secret empty. A placeholder such as `change-me` passes a presence check and can end up in production.
- The app's config validation should reject empty, placeholder and too-short secrets at boot (see `<shared>/principles.md` -> System: config is code).
- Check that `.env` is listed in `.gitignore`; report it if not.
