# Dockerfiles

Templates for Node, Python, Go and Java, plus rules for any other stack. If `<shared>/stacks/` has a file for the detected stack (for example `node-typescript.md`, `python-fastapi.md`), its Dockerfile section wins over the template here.

## Rules for Every Stack

- **Runtime version from the project.** Read `.nvmrc`, `engines.node`, `.python-version`, `requires-python`, `go.mod`, or the Maven/Gradle toolchain. If none is set, use the current LTS or stable release and say so in the report. Never copy a version from an example without checking it is still supported.
- **Fill every placeholder** in angle brackets (`<node-major>`, `<go-version>`, `<pinned-version>`) before building; a template with a placeholder left in fails the build on purpose.
- **Pin base images.** Use a specific version tag in the Dockerfile; pin by digest (`image:tag@sha256:...`) for production builds and let Dependabot or Renovate update it.
- **Multi-stage.** Build tools and dev dependencies stay in the build stage. The runtime stage gets only the built output and production dependencies.
- **Non-root with a numeric UID** (`USER 10001` or the image's built-in user by number). Kubernetes `runAsNonRoot` can only verify a numeric UID.
- **Exec-form start command** (`CMD ["node", "dist/server.js"]`), so SIGTERM reaches the app. If the app spawns child processes, add an init (`tini`, or `docker run --init`) to reap zombies.
- **Derive entrypoint and port** from the manifest and code (`main`, `start` script, `[project.scripts]`, the server's listen call). Do not hard-code `dist/main.js` or 3000 unless the project uses them.
- **No secrets in layers.** Never `COPY .env`, never pass secrets through `ARG` or `ENV`. Use BuildKit secrets for private registries: `RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci`.
- **Writable paths.** If the app writes files, give it a dedicated directory (for example `/tmp` or `/app/var`) so the root filesystem can be read-only in production.
- **No migrations in the start command.** Migrations run as a separate pipeline job (see `ci-pipelines.md`). The image may include the migration tool so the job can reuse it.
- **`HEALTHCHECK`** is optional. Docker and compose use it; Kubernetes ignores it and uses probes instead.
- Add `LABEL org.opencontainers.image.source=<repo URL>` so registries link the image to its source.

## Node.js

Use the package manager the lockfile names (see `<shared>/stacks/node-typescript.md` section 1). npm shown here.

```dockerfile
# syntax=docker/dockerfile:1
# NODE_VERSION: the project's major from .nvmrc or engines; else the current Active LTS.
ARG NODE_VERSION=<node-major>
FROM node:${NODE_VERSION}-slim AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build --chown=1000:1000 /app/dist ./dist
# The node user in the official image has UID 1000.
USER 1000
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

- Use `npm ci --omit=dev` (the old `--only=production` flag is deprecated).
- Replace `dist/server.js` and `3000` with the project's real entry file and port.
- Prefer `-slim` (glibc). Use `-alpine` only if the project already does; native modules (argon2, bcrypt, Prisma engines) need musl builds there.
- Prisma: run `npx prisma generate` in the build stage and copy the generated client into the runtime stage.

## Python

uv shown here; for Poetry or pip see the notes. `<shared>/stacks/python-fastapi.md` has the FastAPI-specific variant.

```dockerfile
# syntax=docker/dockerfile:1
# PYTHON_VERSION: the project's minor from .python-version or requires-python.
ARG PYTHON_VERSION=3.12
FROM python:${PYTHON_VERSION}-slim AS build
# Pin the uv image to a release tag.
COPY --from=ghcr.io/astral-sh/uv:<pinned-version> /uv /bin/uv
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy UV_PYTHON_DOWNLOADS=0
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev --no-install-project
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv uv sync --frozen --no-dev

FROM python:${PYTHON_VERSION}-slim AS runtime
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=build --chown=10001:10001 /app /app
ENV PATH="/app/.venv/bin:$PATH" PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1
USER 10001
EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- Keep build and runtime on the same base image so the virtualenv paths match.
- Poetry: `poetry install --only main --no-root` in the build stage. pip: `pip install --no-cache-dir -r requirements.txt` into a venv in the build stage, then copy the venv.
- Django: run `collectstatic` in the build stage; serve with gunicorn (`gunicorn project.wsgi -b 0.0.0.0:8000`) or an ASGI server.
- Replace `app.main:app` and the port with the project's real values.

## Go

```dockerfile
# syntax=docker/dockerfile:1
# GO_VERSION: the go directive (or toolchain line) in go.mod.
ARG GO_VERSION=<go-version>
FROM golang:${GO_VERSION} AS build
WORKDIR /src
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod go mod download
COPY . .
RUN --mount=type=cache,target=/go/pkg/mod --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/server ./cmd/server

# Distroless static with a non-root user (UID 65532). Use the current Debian-based tag.
FROM gcr.io/distroless/static-debian12:nonroot AS runtime
COPY --from=build /out/server /server
USER 65532:65532
EXPOSE 8080
ENTRYPOINT ["/server"]
```

- Replace `./cmd/server` with the real main package and `8080` with the real port.
- If the binary needs cgo (for example SQLite via `mattn/go-sqlite3`), keep `CGO_ENABLED=1` and use `gcr.io/distroless/base-debian12:nonroot` or a slim Debian image.
- Distroless has no shell, so `docker exec ... sh` and shell-based healthchecks do not work. Add a `-health` flag to the binary if compose needs a healthcheck.
- Embed migrations (`embed.FS`) or ship them in a separate migration image; the runtime image has no tools.

## Java (Spring Boot or other JVM)

```dockerfile
# syntax=docker/dockerfile:1
# JAVA_VERSION: the toolchain release in pom.xml or build.gradle; use an LTS.
ARG JAVA_VERSION=21
FROM eclipse-temurin:${JAVA_VERSION}-jdk AS build
WORKDIR /src
COPY mvnw pom.xml ./
COPY .mvn .mvn
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -B dependency:go-offline
COPY src src
RUN --mount=type=cache,target=/root/.m2 ./mvnw -q -B package -DskipTests \
 && java -Djarmode=tools -jar target/*.jar extract --layers --launcher --destination /out

FROM eclipse-temurin:${JAVA_VERSION}-jre AS runtime
RUN groupadd --system --gid 10001 app && useradd --system --uid 10001 --gid app --no-create-home app
WORKDIR /app
COPY --from=build /out/dependencies/ ./
COPY --from=build /out/spring-boot-loader/ ./
COPY --from=build /out/snapshot-dependencies/ ./
COPY --from=build /out/application/ ./
USER 10001
ENV JAVA_TOOL_OPTIONS="-XX:MaxRAMPercentage=75 -XX:+ExitOnOutOfMemoryError"
EXPOSE 8080
ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]
```

- Tests run in CI before the image build, so `-DskipTests` in the Dockerfile is fine. Never skip them in the pipeline.
- The layered `extract` command and `JarLauncher` package name depend on the Spring Boot version. The shown form (`-Djarmode=tools ... extract --layers --launcher`) needs Spring Boot 3.3 or later. On 3.2 use `-Djarmode=layertools -jar app.jar extract --destination /out` with `org.springframework.boot.loader.launch.JarLauncher`; before 3.2 use the same `layertools` extract with `org.springframework.boot.loader.JarLauncher`. If `target/*.jar` matches more than one jar (a `-plain.jar`), name the boot jar explicitly. For non-Spring apps, copy the fat jar and run `java -jar app.jar`.
- Gradle: replace the Maven lines with `./gradlew --no-daemon bootJar` and use `build/libs/*.jar`.
- Spring Boot: enable graceful shutdown (`server.shutdown=graceful`) and Actuator probes (`management.endpoint.health.probes.enabled=true`, routes `/actuator/health/liveness` and `/actuator/health/readiness`).
- Alternatives: Jib or Cloud Native Buildpacks (`./mvnw spring-boot:build-image`) build images without a Dockerfile; keep them if the project already uses them.

## Other Stacks

For Rust, Ruby, PHP, .NET, Elixir or anything else, apply the rules above with the ecosystem's official images:

- Build stage: the official SDK or toolchain image, dependency fetch cached before copying source.
- Runtime stage: the smallest official runtime image that runs the output (for example `mcr.microsoft.com/dotnet/aspnet` for .NET, a slim Debian image for Rust, Ruby or Elixir releases).
- Non-root numeric UID, exec-form command, the project's real port and entry point.
- Say in the report that no stack-specific template was used.

## .dockerignore

Start from this and add project-specific build output:

```text
.git
.github
.gitlab-ci.yml
.opencode
.claude
.agents
.vscode
.idea
node_modules
.venv
venv
__pycache__
*.pyc
target
build
dist
coverage
.pytest_cache
.env
.env.*
!.env.example
*.pem
*.key
id_rsa*
.npmrc
.pypirc
credentials*.json
Dockerfile*
compose*.yaml
docker-compose*.yml
docs
*.md
```

- Remove `dist`, `build` or `target` from the list if the Dockerfile copies prebuilt output instead of building inside the image.
- Keep `README.md` if the build needs it (some Python build backends read it): drop the `*.md` line; `docs` stays excluded.
