# Stack Reference: Python + FastAPI

Read this when the detected stack is Python with FastAPI (or Starlette), Pydantic v2, SQLAlchemy 2.x and Alembic. Django/DRF notes are at the end. For database rules (locks, `CONCURRENTLY`, expand/contract) also read `postgres.md` in this folder. The Always Ask First list in `tool-rules.md` wins over anything here.

## Detect the Stack

| Signal | Meaning |
|---|---|
| `fastapi` in `pyproject.toml` / `requirements*.txt` | FastAPI app |
| `sqlalchemy>=2`, `create_async_engine`, `AsyncSession` | SQLAlchemy 2.x async |
| `alembic.ini` + `migrations/` or `alembic/` with `env.py` | Alembic |
| `pydantic>=2`, `model_config`, `field_validator` | Pydantic v2 (`class Config`, `@validator`, `orm_mode` mean v1) |
| `manage.py`, `settings.py`, `INSTALLED_APPS` | Django (see Django/DRF Notes) |

Package manager (use the one the lockfile says; never mix):

| Lockfile | Manager | Run a tool | Install from lock (Always Ask First) |
|---|---|---|---|
| `uv.lock` | uv | `uv run pytest` | `uv sync --frozen` |
| `poetry.lock` | Poetry | `poetry run pytest` | `poetry install --sync` (Poetry 1.x) or `poetry sync` (2.x) |
| `requirements.in` + compiled `requirements.txt` | pip-tools | `python -m pytest` in the venv | `pip-sync requirements.txt` |
| `pdm.lock` | PDM | `pdm run pytest` | `pdm sync` |
| `Pipfile.lock` | Pipenv | `pipenv run pytest` | `pipenv sync` |
| only `requirements.txt` | pip | `python -m pytest` in the venv | `pip install -r requirements.txt` |

Adding, upgrading or removing a dependency (`uv add`, `poetry add`, editing `requirements.in` + `pip-compile`) is Always Ask First.

## Project Layout

Prefer feature modules over one giant `models.py` / `routes.py`:

```text
src/app/main.py         # create_app(), lifespan, routers, middleware
src/app/core/           # config.py, db.py, security.py, errors.py, logging.py
src/app/users/          # router.py (thin), schemas.py (Pydantic), models.py (ORM),
                        # service.py (logic, no FastAPI imports), repository.py (optional)
migrations/             # Alembic env.py + versions/
tests/                  # mirrors src/app/
```

Rules: routers parse input and call services; services do not import `fastapi` or raise `HTTPException`; ORM models never leave the service layer without a response schema.

## Settings (pydantic-settings)

```python
from functools import lru_cache
from pydantic import PostgresDsn, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_prefix="APP_", extra="ignore")
    database_url: PostgresDsn
    jwt_issuer: str
    jwt_audience: str
    jwt_jwks_url: str
    secret_key: SecretStr          # SecretStr hides the value in repr/logs

@lru_cache
def get_settings() -> Settings:
    return Settings()
```

Fail at startup on missing config (no defaults for secrets). Commit `.env.example`, never `.env`.

## Database Session and Dependency Injection

```python
from collections.abc import AsyncIterator
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
engine = create_async_engine(str(get_settings().database_url), pool_pre_ping=True, pool_size=10, max_overflow=5)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        yield session
SessionDep = Annotated[AsyncSession, Depends(get_session)]
CurrentUser = Annotated[User, Depends(get_current_user)]

@router.post("/orders", response_model=OrderOut, status_code=201)
async def create_order(body: OrderIn, session: SessionDep, user: CurrentUser) -> OrderOut:
    order = await order_service.create(session, user, body)
    await session.commit()            # explicit commit; the session closes (and rolls back) on exit
    return OrderOut.model_validate(order)
```

- Use `Annotated[..., Depends(...)]` aliases (`typing.Annotated`, `fastapi.Depends`); dependencies are cached per request. Tests swap them with `app.dependency_overrides[get_session] = ...`; clear the dict after each test.
- Engine URL scheme must be async: `postgresql+asyncpg://` (or `postgresql+psycopg://` for psycopg 3); a plain `postgresql://` URL loads the sync psycopg2 driver and fails. Alembic can use the same async URL with the async template.

## Request and Response Models (Pydantic v2)

```python
from pydantic import BaseModel, ConfigDict, EmailStr, Field

class UserIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    email: EmailStr
    name: str = Field(min_length=1, max_length=100)

class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)   # v1 name: orm_mode
    id: int
    email: EmailStr
```

- Separate In/Out/Update models; never accept `id`, `role`, `tenant_id` or `is_admin` from the body (mass assignment).
- Partial updates: `body.model_dump(exclude_unset=True)`. v1 to v2 renames: `.dict()` -> `.model_dump()`, `.parse_obj()` -> `.model_validate()`, `@validator` -> `@field_validator`.
- Set `response_model` (or a return annotation) on every route so extra ORM fields are filtered out.

## Error Handling

```python
class DomainError(Exception):
    status_code, code = 400, "bad_request"

class NotFound(DomainError):
    status_code, code = 404, "not_found"

@app.exception_handler(DomainError)
async def domain_error_handler(request: Request, exc: DomainError) -> JSONResponse:
    return JSONResponse(status_code=exc.status_code, media_type="application/problem+json",
                        content={"type": exc.code, "title": str(exc), "status": exc.status_code})
```

Keep one error shape (RFC 9457 problem details or the project's existing format). Add a catch-all handler that logs the traceback and returns a generic 500 without internals. Customize `RequestValidationError` only to match the shape, not to hide field errors.

## Auth

JWT verification with PyJWT (`pyjwt[crypto]` for RS/ES algorithms):

```python
import jwt
from jwt import PyJWKClient

jwks = PyJWKClient(settings.jwt_jwks_url)            # caches keys

def verify(token: str) -> dict:
    key = jwks.get_signing_key_from_jwt(token).key
    return jwt.decode(
        token, key,
        algorithms=["RS256"],                         # pin; never read alg from the token
        audience=settings.jwt_audience,
        issuer=settings.jwt_issuer,
        options={"require": ["exp", "iat", "sub", "iss", "aud"]},
        leeway=30,
    )
```

joserfc alternative (`from joserfc import jwt`): `token = jwt.decode(value, key, algorithms=["RS256"])`, then validate claims with `jwt.JWTClaimsRegistry(exp={"essential": True}, sub={"essential": True}, iss={"essential": True, "value": ISS}, aud={"essential": True, "value": AUD}).validate(token.claims)`. joserfc does not validate claims in `decode`; skipping the registry is a bug.

Rules: never `options={"verify_signature": False}` outside tests; never allow `none` or mix HS and RS algorithms; map `jwt.InvalidTokenError` to 401; check tenant/ownership in the query, not only the role. `PyJWKClient` fetches keys with blocking HTTP: call `verify` from a sync (`def`) dependency or via `anyio.to_thread.run_sync`, not directly inside `async def`. Follow the JWT and CSRF rules in `backend-auth` for cookies.

Password hashing: passlib is unmaintained, misbehaves with newer `bcrypt` releases, and depends on the stdlib `crypt` module that Python 3.13 removed. Use `pwdlib` or `argon2-cffi`:

```python
from pwdlib import PasswordHash
password_hash = PasswordHash.recommended()            # Argon2
hashed = password_hash.hash(raw)
ok = password_hash.verify(raw, hashed)
```

With `argon2-cffi`: `ph = argon2.PasswordHasher()`; `ph.verify(stored, raw)` raises `argon2.exceptions.VerifyMismatchError` on a wrong password; rehash when `ph.check_needs_rehash(stored)` is true. Migrating from passlib bcrypt: `PasswordHash((Argon2Hasher(), BcryptHasher()))` (install `pwdlib[argon2,bcrypt]`) verifies old hashes; `verify_and_update(raw, stored)` returns a new Argon2 hash to save on next login.

## Alembic Workflow

1. Create with the async template if the app is async: `alembic init -t async migrations`. In `env.py`, set `target_metadata = Base.metadata` and import every models module so autogenerate sees them.
2. Set a naming convention on `MetaData(naming_convention={...})` so constraints get stable names.
3. Generate: `alembic revision --autogenerate -m "add orders status"`. It connects to the configured DB to compare (read-only); point it at a provably local DB only (see `tool-rules.md` -> Production Targets).
4. Review the generated file line by line. Autogenerate is a draft:
   - **Rename-as-drop**: a renamed column or table comes out as drop + add/create (data loss). Replace with `op.alter_column("t", "old", new_column_name="new")` or `op.rename_table("old", "new")`, or use expand/contract when old code still reads the old name.
   - It misses or mis-detects: enum value changes, server default changes (unless `compare_server_default=True`), some type changes, check constraints, views, triggers, functions and data migrations.
   - New `NOT NULL` column on a populated table: add nullable, backfill in batches, then set NOT NULL (see `postgres.md`).
   - Indexes on large Postgres tables: `with op.get_context().autocommit_block(): op.create_index(..., postgresql_concurrently=True)`.
   - Set `op.execute("SET lock_timeout = '5s'")` at the top of DDL migrations on hot tables.
   - Write a real `downgrade()` or state why it is irreversible.
5. Render the SQL without touching a DB (offline mode): `alembic upgrade <prev_rev>:<new_rev> --sql > migration.sql`, or `alembic upgrade head --sql`.
6. Check state: `alembic current`, `alembic history --verbose`, `alembic heads` (more than one head means branches; fix with `alembic merge -m "merge heads" <rev1> <rev2>`, which only writes a file).

Safe to run without asking (read-only or file-only): `alembic revision`, `alembic history`, `alembic heads`, `alembic show <rev>`, `alembic current` and `alembic check` against a provably local DB, `alembic upgrade ... --sql`. Against any other DB they are read-only but still need confirmation (Production Targets).

**Always Ask First**: `alembic upgrade` (without `--sql`), `alembic downgrade`, `alembic stamp` (rewrites the version table), and any of them against a shared or production DB. Applying migrations belongs to `backend-migrate`; deploy pipelines run it as a gated step.

## Testing

Use pytest with pytest-asyncio (`asyncio_mode = "auto"` under `[tool.pytest.ini_options]`; in strict mode decorate async fixtures with `@pytest_asyncio.fixture`) or the AnyIO plugin, whichever the project uses.

```python
import pytest
from httpx import ASGITransport, AsyncClient
from testcontainers.postgres import PostgresContainer

@pytest.fixture(scope="session")
def pg_url():
    with PostgresContainer("postgres:16-alpine", driver="asyncpg") as pg:   # match prod major
        yield pg.get_connection_url()     # postgresql+asyncpg://... (testcontainers 4.x)

@pytest.fixture(scope="session")
async def engine(pg_url):                 # needs session loop scope (see below)
    eng = create_async_engine(pg_url)
    yield eng
    await eng.dispose()

@pytest.fixture
async def session(engine):
    async with engine.connect() as conn:
        trans = await conn.begin()
        s = AsyncSession(bind=conn, expire_on_commit=False,
                         join_transaction_mode="create_savepoint")
        try:
            yield s                       # app code may commit; it only releases a savepoint
        finally:
            await s.close()
            await trans.rollback()        # every test starts clean

@pytest.fixture
async def client(session):
    app.dependency_overrides[get_session] = lambda: session
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
    app.dependency_overrides.clear()
```

- Create the schema once per session by running the Alembic migrations against the container, so migrations are tested too. Testcontainers needs Docker; if Docker is absent, say so and fall back to a disposable local DB, never a shared one.
- `ASGITransport` does not run lifespan events; wrap the app in `asgi_lifespan.LifespanManager` if startup matters for the test.
- `TestClient` (sync) is fine for sync tests; do not mix it with async DB fixtures on another event loop.
- If session-scoped async fixtures fail with "attached to a different loop", put fixtures and tests on one session loop (recent pytest-asyncio: `asyncio_default_fixture_loop_scope = "session"` and `asyncio_default_test_loop_scope = "session"`, or `loop_scope="session"` on the marker) instead of hacking event loops.
- Run: `uv run pytest -q` (or the detected manager); coverage with `pytest --cov=app --cov-report=term-missing` if `pytest-cov` is installed.

## Lint and Types

- `ruff check .` and `ruff format --check .` (read-only). `ruff check --fix` and `ruff format` edit files: run them only on files this run created or edited (pass the paths, not `.`) and record them in the checkpoint.
- Types: `mypy src` (add the `pydantic.mypy` plugin) or `pyright`. Use whichever the project configures in `pyproject.toml`; do not add a second one.
- Useful ruff rule sets: `E,F,I,B,UP,ASYNC,S` (`ASYNC` catches blocking calls in async code, `S` is bandit-style security).

## Logging and Observability

- Use `structlog` with JSON rendering in production, or stdlib `logging` with a JSON formatter. One line per event, with `request_id`, `trace_id`, route and status. Bind a request ID in middleware (read `X-Request-ID` or generate one) using `structlog.contextvars.bind_contextvars`, and clear context at the start of each request.
- Never log tokens, passwords, full request bodies or `SecretStr` values.
- OpenTelemetry: `FastAPIInstrumentor.instrument_app(app)` (`opentelemetry-instrumentation-fastapi`) and `SQLAlchemyInstrumentor().instrument(engine=engine.sync_engine)`; export via OTLP using the standard `OTEL_EXPORTER_OTLP_ENDPOINT` and `OTEL_SERVICE_NAME` env vars. Zero-code option: `opentelemetry-instrument uvicorn app.main:app`. With pre-forking servers, initialize the tracer provider in each worker (after fork), not in the master.

## Serving, Workers, Lifespan

- Use a lifespan context manager (`@asynccontextmanager async def lifespan(app)`: startup code, `yield`, then shutdown code such as stopping consumers, flushing telemetry and `await engine.dispose()`), passed as `FastAPI(lifespan=lifespan)`. `@app.on_event` is deprecated.
- Dev: `uvicorn app.main:app --reload`. Production: `uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers 4 --proxy-headers --forwarded-allow-ips="<proxy CIDR>" --timeout-graceful-shutdown 25`.
- Gunicorn as process manager: `gunicorn app.main:app -k uvicorn_worker.UvicornWorker -w 4 --graceful-timeout 25 --timeout 60` (`uvicorn-worker` package; `uvicorn.workers.UvicornWorker` is deprecated).
- In Kubernetes prefer one worker per container and scale pods; size `pool_size * workers * replicas` below the DB `max_connections` (or use PgBouncer).
- Graceful shutdown: SIGTERM -> stop accepting, finish in-flight requests, run lifespan shutdown. Keep the graceful timeout below the orchestrator's termination grace period. Add `/healthz` (liveness, no DB) and `/readyz` (checks DB) routes.

## Dockerfile (uv)

```dockerfile
# Use the project's Python minor version and pin the uv image to a release tag.
FROM python:3.12-slim AS build
COPY --from=ghcr.io/astral-sh/uv:<pinned-version> /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:3.12-slim
RUN groupadd --system app && useradd --system --gid app --no-create-home app
WORKDIR /app
COPY --from=build --chown=app:app /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1
USER app
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- Exec-form `CMD` so SIGTERM reaches uvicorn. Keep build and runtime on the same base image so the venv paths match. Add a `.dockerignore` (`.venv`, `.git`, `.env*`, `__pycache__`, tests if not needed).
- Do not run migrations in the container `CMD`; run them as a separate gated pipeline step (see `backend-deploy`).
- Poetry projects: export with `poetry export` (Poetry 2.x needs the `poetry-plugin-export` plugin) or install with `poetry install --only main --no-root` in the build stage.

## Common Anti-Patterns

| Anti-pattern | Why it hurts | Fix |
|---|---|---|
| Sync DB driver / `requests` / `time.sleep` inside `async def` | Blocks the event loop; all requests stall | Use async drivers (`asyncpg`, `httpx.AsyncClient`), or declare the route `def` so it runs in the threadpool, or `await anyio.to_thread.run_sync(fn)` |
| Lazy-loaded relationships in async code | `MissingGreenlet` errors, or N+1 queries | `selectinload()` / `joinedload()` in the query; set `lazy="raise"` on relationships to catch misses |
| Loop issuing one query per item | N+1 | One query with `IN (...)` or eager loading; check with `echo=True` in tests |
| `expire_on_commit=True` with async sessions | Attribute access after commit triggers implicit IO | `async_sessionmaker(..., expire_on_commit=False)` |
| Module-level `AsyncSession` shared across requests | Cross-request data leaks, concurrency errors | One session per request via dependency |
| Returning ORM objects with no response model | Leaks hashed passwords, internal fields | `response_model=...Out` |
| `BackgroundTasks` for long or must-succeed work | Lost on restart, holds the worker | A real queue (Celery, arq, Dramatiq) with retries and idempotency |
| `except Exception: pass` | Hides failures | Catch specific errors; log and re-raise |
| Creating the engine per request | Pool exhaustion | One engine per process, created at import or in lifespan |
| `allow_origins=["*"]` with `allow_credentials=True` | Insecure CORS | Explicit origin list |

## Django / DRF Notes

- Layout: apps per domain; business logic in services or model methods, not in views or serializers.
- Settings: `django-environ` or pydantic-settings; `DEBUG=False`, `ALLOWED_HOSTS`, `SECURE_*` and `CSRF_TRUSTED_ORIGINS` set in production.
- Migrations: `python manage.py makemigrations --check --dry-run` (detect drift), `python manage.py sqlmigrate <app> <number>` (show SQL) and `python manage.py showmigrations` are safe. `python manage.py makemigrations` writes files. **Always Ask First**: `python manage.py migrate`, `migrate <app> <earlier>` (rollback), `flush`. Renames: Django asks interactively whether a field was renamed; answer correctly or write `RenameField` by hand. Use `AddIndexConcurrently` (from `django.contrib.postgres.operations`) with `atomic = False` for large tables. `RunPython` needs a reverse function.
- DRF: set `DEFAULT_PERMISSION_CLASSES` to authenticated by default; scope querysets in `get_queryset()` to the user or tenant; use `select_related` / `prefetch_related` to avoid N+1; explicit `fields` on serializers (never `"__all__"` for writes); `read_only_fields` for `id`, owner and role.
- Auth: session auth needs CSRF; token or JWT auth (`djangorestframework-simplejwt`) needs the same alg pinning and claim checks as above.
- Tests: `pytest-django` with the `db` fixture (each test in a rolled-back transaction); `APIClient` for requests.
- Async: Django's async ORM is partial; wrap sync ORM calls in `sync_to_async` inside async views, or keep views sync.
- Serving: `gunicorn project.wsgi` (sync) or `uvicorn project.asgi:application` (async). Run `python manage.py collectstatic --noinput` in the image build, not at start.
