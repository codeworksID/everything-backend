# Check Commands by Stack

Use this catalog to pick concrete commands in Step 1. Always prefer the project's own scripts (package.json `scripts`, Makefile targets, tox/nox sessions, CI job steps) over the defaults below. Read each script body before running it (see `<shared>/tool-rules.md` -> Runs Without Asking): a script that migrates, seeds, resets or connects to a database is an integration run and needs the Target Check.

Never invent a script name. If a tool or plugin is not installed or configured, do not install it: report "not run: <tool> not configured" and give the setup command as a recommendation.

## Contents

- Package manager and environment detection
- Test and coverage
- Build, lint and type checks
- Dependency audits
- Read-only migration status
- Windows notes

## Package Manager and Environment Detection

### Node.js: pick the package manager from the lockfile

| Lockfile | Manager | Run a script |
|---|---|---|
| `package-lock.json` | npm | `npm run <script>` |
| `pnpm-lock.yaml` | pnpm | `pnpm run <script>` |
| `yarn.lock` | yarn | `yarn <script>` |
| `bun.lockb` or `bun.lock` | bun | `bun run <script>` |

If `packageManager` is set in package.json, it wins. If no lockfile exists, say so: audits need a lockfile to be meaningful.

### Python: run tools inside the project's environment

Bare `pytest` or `pip-audit` may run against the wrong interpreter and give a false clean result. Detect the environment first:

| Signal | Prefix |
|---|---|
| `uv.lock` | `uv run --no-sync` (plain `uv run` may sync, which installs packages) |
| `poetry.lock` | `poetry run` |
| `Pipfile.lock` | `pipenv run` |
| `.venv/` or `venv/` in the project | `.venv/bin/python -m` (Windows: `.venv\Scripts\python.exe -m`) |
| none of these | the active interpreter; say in the report which one was used (`python -c "import sys; print(sys.executable)"`) |

Read `[tool.pytest.ini_options]`, `[tool.ruff]`, `[tool.mypy]` and `[tool.bandit]` in pyproject.toml when present.

### Java: Maven or Gradle

- `mvnw` / `pom.xml`: use `./mvnw` (Windows: `mvnw.cmd`), else `mvn`.
- `gradlew` / `build.gradle(.kts)`: use `./gradlew` (Windows: `gradlew.bat`), else `gradle`.
- Run a plugin goal (SpotBugs, Checkstyle, JaCoCo, OWASP Dependency-Check) only if the plugin is declared in the build file. Otherwise report it as not configured.

## Test and Coverage

All of these are integration runs unless the script provably runs only hermetic unit tests. Run them after the Target Check passes.

| Stack | Tests | Coverage (only if already configured) |
|---|---|---|
| Node.js | the `test` / `test:ci` script | Jest or Vitest: append `-- --coverage` to the test script |
| Python | `<prefix> pytest` | `<prefix> pytest --cov=<package> --cov-report=term` (needs pytest-cov installed) |
| Go | `go test ./...` | `go test -coverprofile=coverage.out ./...` then `go tool cover -func=coverage.out` |
| Maven | `./mvnw test` (or `verify`) | JaCoCo report goal if the plugin is declared |
| Gradle | `./gradlew test` | `./gradlew jacocoTestReport` if the plugin is declared |
| Generic | `make test` | the project's coverage target, if any |

Run the suite once. If coverage is configured, run that variant instead of the plain one. Record the coverage number and the tool that produced it. If coverage is not configured, the report says "coverage: not measured", never a guess.

### Classifying failures

Before rating a failure, classify it:

- **Environment**: missing env var, database or service not reachable, missing system library, wrong runtime version. Report as a Medium "Setup" finding with the setup steps. Do not rate it as a code defect.
- **Flaky**: passes on an immediate single re-run of that test with no change. Report as Medium "Flaky test" with the test name. Re-run at most once.
- **Code**: fails consistently with an assertion or exception from project code. Rate it with the severity table in SKILL.md.

Never edit, skip or loosen a test to get a result (see `<shared>/tool-rules.md` -> Test Integrity).

## Build, Lint and Type Checks

| Stack | Build | Lint / format | Types |
|---|---|---|---|
| Node.js | the `build` script | the `lint` script; `npx --no-install eslint .` if ESLint is installed | the `typecheck` script, or `npx --no-install tsc --noEmit` |
| Python | `<prefix> python -m build` only if the project publishes a package | `<prefix> ruff check .`, `<prefix> ruff format --check .` or `black --check .` | `<prefix> mypy .` or `<prefix> pyright` |
| Go | `go build ./...` | `go vet ./...`, `golangci-lint run ./...` if installed | (compiler) |
| Maven | `./mvnw -DskipTests package` | `checkstyle:check`, `spotbugs:check` if declared | (compiler) |
| Gradle | `./gradlew assemble` | `./gradlew check -x test` | (compiler) |
| Rust | `cargo build` | `cargo clippy -- -D warnings`, `cargo fmt --check` | (compiler) |

`npx --no-install` fails instead of downloading a package; a download is an install and needs confirmation.

Builds are local and hermetic, so they run without asking. A build that fails is Critical.

## Dependency Audits

Audit production dependencies separately from dev dependencies: the severity rules treat them differently.

| Stack | Production only | All dependencies |
|---|---|---|
| npm | `npm audit --omit=dev` | `npm audit` |
| pnpm | `pnpm audit --prod` | `pnpm audit` |
| yarn 1 | `yarn audit --groups dependencies` | `yarn audit` |
| yarn 2+ | `yarn npm audit --environment production` | `yarn npm audit --all` |
| bun | `bun audit` (recent Bun releases; else use osv-scanner) | same |
| Python | `<prefix> pip-audit` against the project env, after confirming dev extras are not installed, or `osv-scanner` with the lockfile | same |
| Go | `govulncheck ./...` (reports only reachable vulnerabilities) | same |
| Maven | `./mvnw org.owasp:dependency-check-maven:check` (slow on first run; may need an NVD API key) | same |
| Gradle | `./gradlew dependencyCheckAnalyze` if the plugin is declared | same |
| Rust | `cargo audit` if installed | same |
| Any | `osv-scanner` with the lockfile, if installed (check `osv-scanner --help` for the flag form of the installed version) | same |

Notes:

- `pip-audit -r requirements.txt` builds a temporary virtualenv and installs packages, so it is Always Ask First. Auditing the existing environment is not.
- Do not use `safety check`: it is deprecated, and its replacement `safety scan` needs an account login.
- Do not use `./mvnw dependency:check`; that goal does not exist. `dependency:analyze` finds unused or undeclared dependencies, not vulnerabilities.
- `npm audit fix`, `pnpm update`, and any upgrade are installs: recommend them, never run them.
- License review (copyleft or unknown licenses) belongs to backend-security. If a license tool is already configured in the project, you may run it and report results.

## Read-Only Migration Status

Optional. It connects to the database, so run it only after the Target Check passes for that database. These commands report state and do not apply anything:

| Tool | Status command |
|---|---|
| Prisma | `npx --no-install prisma migrate status` |
| Alembic | `<prefix> alembic current` and `<prefix> alembic heads` |
| Django | `<prefix> python manage.py showmigrations` |
| Rails | `bin/rails db:migrate:status` |
| Knex | `npx --no-install knex migrate:status` |
| Flyway | `flyway info` |
| Liquibase | `liquibase status` |
| goose | `goose status` |
| golang-migrate | `migrate version` |
| Atlas | `atlas migrate status` |
| EF Core | `dotnet ef migrations list` |

Report pending or diverged migrations as High, with Next skill backend-migrate. Never run `migrate`, `upgrade`, `deploy`, `push` or `reset` from doctor. The guard may ask before some status commands because they share a prefix with apply commands; that is expected.

## Windows Notes

- Use `mvnw.cmd`, `gradlew.bat` and `.venv\Scripts\python.exe` in PowerShell.
- `curl` in Windows PowerShell 5.1 is an alias for `Invoke-WebRequest`. Use `curl.exe` or `Invoke-WebRequest -UseBasicParsing`.
- `2>/dev/null` does not work in PowerShell; use `2>$null`.
- For content searches without a search tool, use `Select-String -Path <glob> -Pattern <regex>`.
